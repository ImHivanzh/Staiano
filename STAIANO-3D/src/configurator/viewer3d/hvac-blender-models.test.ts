import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { grilleHinge } from "./EcoclimaGrille";

it.each(["ega6", "ebl", "egf", "egf-push", "innova-sli-core", "innova-sli-panel", "aermec-fcz-p-po", "innova-osmo-sl", "plenum-3-stacchi"])("loads the editable Blender export %s without unrelated scene objects", async (name) => {
  const data = readFileSync(`public/models/hvac/${name}-realistic.glb`);
  const model = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  const meshes: Mesh[] = [];
  model.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
  expect(meshes.length).toBeGreaterThan(1);
  expect(meshes.some((object) => object.name.startsWith("Preview"))).toBe(false);
  const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
  expect([size.x, size.y, size.z].every((dimension) => dimension > 0 && Number.isFinite(dimension))).toBe(true);
  if (name === "egf-push") {
    expect(model.scene.children.filter((object) => /^Cornice_mobile/.test(object.name))).toHaveLength(4);
    expect(model.scene.children.filter((object) => /^Cornice_fissa/.test(object.name))).toHaveLength(4);
    expect(model.scene.children.some((object) => /^Pannello_forato/.test(object.name))).toBe(true);
    expect(model.scene.children.some((object) => /^Filtro/.test(object.name))).toBe(true);
    const panel = model.scene.children.find((object) => /^Pannello_forato/.test(object.name))!;
    const before = panel.getWorldPosition(new Vector3());
    const hinge = grilleHinge(model.scene);
    expect(panel.getWorldPosition(new Vector3()).distanceTo(before)).toBeLessThan(1e-6);
    hinge.rotation.x = -1;
    const after = panel.getWorldPosition(new Vector3());
    expect(after.distanceTo(before)).toBeGreaterThan(0.1);
    expect(after.z).toBeGreaterThan(before.z);
    expect(model.scene.children.some((object) => /^Filtro/.test(object.name))).toBe(true);
  }
  if (name === "plenum-3-stacchi") {
    const collars = meshes.filter((object) => object.name.startsWith("Stacco_aperto"));
    const face = meshes.find((object) => object.name.startsWith("Pannello_forato"))!;
    expect(collars).toHaveLength(3);
    model.scene.updateMatrixWorld(true);
    for (const x of [-.24, 0, .24]) {
      const ray = new Raycaster(new Vector3(x, 0, .5), new Vector3(0, 0, -1));
      expect(ray.intersectObject(face)).toHaveLength(0);
      for (const collar of collars) expect(ray.intersectObject(collar)).toHaveLength(0);
    }
  }
});
