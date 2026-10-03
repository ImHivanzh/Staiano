import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  model3dCatalog,
  model3dSchema,
  verifiedRadiatorModel,
} from "./models3d";
import { radiatorProducts } from "./radiators";

describe("manufacturer OBJ to GLB snapshots", () => {
  it("preserves measured dimensions in metres, valid normals and internal indices", () => {
    for (const model of model3dCatalog.models) {
      const file = readFileSync(`public${model.localUrl}`);
      expect(createHash("sha256").update(file).digest("hex")).toBe(
        model.glbSha256,
      );
      expect(file.length).toBe(model.glbBytes);
      expect(file.readUInt32LE(0)).toBe(0x46546c67);
      expect(file.readUInt32LE(4)).toBe(2);
      expect(file.readUInt32LE(8)).toBe(file.length);
      const jsonBytes = file.readUInt32LE(12);
      expect(file.readUInt32LE(16)).toBe(0x4e4f534a);
      const doc = JSON.parse(file.subarray(20, 20 + jsonBytes).toString());
      const binaryStart = 20 + jsonBytes + 8;
      expect(file.readUInt32LE(binaryStart - 4)).toBe(0x004e4942);
      expect(doc.buffers).toHaveLength(1);
      expect(doc.buffers[0].uri).toBeUndefined();
      expect(doc.images).toBeUndefined();
      const position = doc.accessors[0];
      expect(position.count).toBe(model.vertices);
      expect(doc.accessors[2].count).toBe(model.triangles * 3);
      for (let axis = 0; axis < 3; axis++) {
        expect((position.max[axis] - position.min[axis]) * 1000).toBeCloseTo(
          model.measuredDimensionsMm[axis],
          3,
        );
        expect(position.min[axis]).toBeCloseTo(-position.max[axis], 6);
      }
      // Check all triangle indices, including the last one; no external buffer references.
      const indexStart = binaryStart + doc.bufferViews[2].byteOffset;
      for (let i = 0; i < doc.accessors[2].count; i++) {
        if (file.readUInt32LE(indexStart + i * 4) >= model.vertices)
          throw new Error(`${model.id}: vertex index out of bounds`);
      }
      const product = radiatorProducts.find((p) => p.id === model.productId)!;
      expect(product).toBeDefined();
      expect(model.columns).toBe(product.columns);
      expect(model.nominalDimensionsMm).toEqual([
        model.elements * product.pitchMm + product.widthAdditionMm,
        product.heightMm,
        product.depthMm,
      ]);
    }
  });

  it("keeps manufacturer mesh/catalog disagreement explicit, blocks placement use", () => {
    const model = model3dCatalog.models.find(
      (m) => m.id === "ardesia-2-460-1800",
    )!;
    expect(model.measuredDimensionsMm[0]).toBeCloseTo(493.2);
    expect(model.nominalDimensionsMm[0]).toBe(484);
    expect(model.dimensionStatus).toBe("review");
    expect(verifiedRadiatorModel(model.productId, model.elements)).toBeNull();
    expect(
      model3dSchema.safeParse({ ...model, dimensionStatus: "verified" })
        .success,
    ).toBe(false);
    expect(verifiedRadiatorModel("cordivari-ardesia-2-600", 11)).toBeNull();
  });
});
