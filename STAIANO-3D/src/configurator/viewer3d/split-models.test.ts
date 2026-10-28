import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import models from "../../../public/models/splits/manifest.json";
import { splitCatalog } from "@/domain/catalogs/splits";
import { splitWallModelUrl } from "@/domain/catalogs/split-models";

it("covers every current wall family and keeps unknown or cassette families on their renderer", () => {
  for (const unit of splitCatalog.indoorUnits.filter(
    (unit) => unit.mounting === "wall",
  )) {
    const url = splitWallModelUrl(unit.family);
    expect(url, unit.model).not.toBeNull();
    expect(existsSync(`public${url}`), unit.model).toBe(true);
  }
  expect(splitWallModelUrl("Round Cassette")).toBeNull();
  expect(splitWallModelUrl("Unknown")).toBeNull();
});

it.each(models)(
  "loads the editable $family reconstruction with its closed vane and reference photo",
  async (model) => {
    const bytes = readFileSync(`public${model.url}`);
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const meshes: Mesh[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes.some((mesh) => /^Deflettore_chiuso/.test(mesh.name))).toBe(
      true,
    );
    expect(meshes.some((mesh) => /^Pannello_frontale/.test(mesh.name))).toBe(
      true,
    );
    expect(gltf.cameras).toHaveLength(0);
    expect(existsSync(`public${model.photo}`)).toBe(true);
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    for (const [index, value] of [size.x, size.y, size.z].entries()) {
      expect(
        Math.abs(value - model.dimensionsMm[index] / 1000),
        model.family,
      ).toBeLessThan(0.004);
    }
  },
);
