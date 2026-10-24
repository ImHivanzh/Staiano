import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  radiatorSections,
  radiatorSectionFor,
  sectionVertexY,
} from "./radiator-sections";
import { radiatorProducts } from "./radiators";
import { model3dCatalog } from "./models3d";
function data(section: (typeof radiatorSections)[number]) {
  const file = readFileSync(`public${section.localUrl}`);
  expect(createHash("sha256").update(file).digest("hex")).toBe(
    section.glbSha256,
  );
  expect(file.length).toBe(section.glbBytes);
  const jsonBytes = file.readUInt32LE(12),
    doc = JSON.parse(file.subarray(20, 20 + jsonBytes).toString()),
    start = 20 + jsonBytes + 8;
  const attribute = (index: number) => {
    const a = doc.accessors[index],
      view = doc.bufferViews[a.bufferView],
      offset = start + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { count: a.count, offset };
  };
  const position = attribute(0),
    normal = attribute(1),
    indices = attribute(2);
  return {
    file,
    position,
    normal,
    indices,
    point: (i: number) =>
      [0, 1, 2].map((axis) =>
        file.readFloatLE(position.offset + i * 12 + axis * 4),
      ),
    ny: (i: number) => file.readFloatLE(normal.offset + i * 12 + 4),
    index: (i: number) => file.readUInt32LE(indices.offset + i * 4),
  };
}
it("keeps OEM provenance, exact assets, independent element dimensions and original full-model review", () => {
  expect(new Set(radiatorSections.map((s) => s.columns)).size).toBe(5);
  for (const section of radiatorSections) {
    const source = model3dCatalog.models.find(
      (m) => m.id === section.sourceModelId,
    )!;
    expect(section.sourceSha256).toBe(source.sourceSha256);
    expect(source.dimensionStatus).toBe("review");
    const mesh = data(section);
    expect(mesh.position.count).toBe(section.vertices);
    expect(mesh.indices.count).toBe(section.triangles * 3);
    const low = [Infinity, Infinity, Infinity],
      high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.position.count; i++)
      for (const [axis, value] of mesh.point(i).entries()) {
        expect(Number.isFinite(value)).toBe(true);
        low[axis] = Math.min(low[axis], value);
        high[axis] = Math.max(high[axis], value);
      }
    for (let axis = 0; axis < 3; axis++)
      expect((high[axis] - low[axis]) * 1000).toBeCloseTo(
        section.measuredDimensionsMm[axis],
        3,
      );
    for (let i = 0; i < mesh.indices.count; i++)
      expect(mesh.index(i)).toBeLessThan(mesh.position.count);
  }
});
it("covers every published Ardesia height and element count without changing saved dimensions", () => {
  const products = radiatorProducts.filter(
    (p) =>
      p.manufacturer === "Cordivari" &&
      /^Ardesia [2-6] colonne$/.test(p.family),
  );
  expect(products.length).toBe(135);
  for (const product of products)
    for (const elements of [3, 10, 40]) {
      const item = {
        manufacturer: product.manufacturer,
        elements,
        widthMm: elements * product.pitchMm + product.widthAdditionMm,
        heightMm: product.heightMm,
        depthMm: product.depthMm,
      };
      const saved = { ...item },
        section = radiatorSectionFor(item, product);
      expect(section).not.toBeNull();
      expect(
        sectionVertexY(
          (section!.sourceHeightMm - section!.connectionOffsetMm) / 2000,
          product.heightMm,
          section!,
        ) * 2000,
      ).toBeCloseTo(product.interaxisMm, 4);
      const mesh = data(section!);
      let low = Infinity,
        high = -Infinity;
      for (let i = 0; i < mesh.position.count; i++) {
        const y = sectionVertexY(mesh.point(i)[1], item.heightMm, section!);
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
      expect(Math.abs((high - low) * 1000 - item.heightMm)).toBeLessThan(1);
      expect(item).toEqual(saved);
    }
});
it("changes only radial tube faces while keeping all non-radial head triangles rigid", () => {
  for (const section of radiatorSections) {
    const mesh = data(section);
    for (const height of [207, 600, 1800, 2500])
      for (let i = 0; i < mesh.indices.count; i += 3) {
        const ids = [mesh.index(i), mesh.index(i + 1), mesh.index(i + 2)];
        const shifts = ids.map((id) => {
          const y = mesh.point(id)[1];
          return sectionVertexY(y, height, section) - y;
        });
        if (Math.max(...shifts) - Math.min(...shifts) > 1e-6)
          for (const id of ids)
            expect(Math.abs(mesh.ny(id))).toBeLessThan(1e-6);
      }
  }
});
it("falls back for missing snapshots, changed historical footprints and other families", () => {
  const product = radiatorProducts.find(
    (p) => p.id === "cordivari-ardesia-2-600",
  )!;
  const item = {
    manufacturer: product.manufacturer,
    elements: 10,
    widthMm: 484,
    heightMm: 600,
    depthMm: 66,
  };
  expect(radiatorSectionFor(item, product)).not.toBeNull();
  expect(radiatorSectionFor({ ...item, widthMm: 480 }, product)).toBeNull();
  expect(radiatorSectionFor(item, null)).toBeNull();
  expect(
    radiatorSectionFor({ ...item, manufacturer: "Global" }, product),
  ).toBeNull();
  expect(() => sectionVertexY(0, 100, radiatorSections[0])).toThrow(/testate/);
});
