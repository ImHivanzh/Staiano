import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Box3, Material, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

it.each(["edls", "edfl"])("loads the %s Blender models with the requested number of slots", async (family) => {
  for (let count = 1; count <= 6; count++) {
    const data = readFileSync(`public/models/ecoclima/${family}-${count}.glb`);
    const model = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes.filter((mesh) => mesh.name.startsWith("Deflector"))).toHaveLength(count);
    const names = meshes.map((mesh) => (mesh.material as Material).name);
    expect(names.some((name) => name.startsWith(family === "edls" ? "Gypsum" : "Profile"))).toBe(true);
    const size = new Box3().setFromObject(model.scene).getSize(new Vector3());
    expect(size.x).toBeCloseTo(1);
    expect(size.y).toBeCloseTo((family === "edls" ? 0.06 : 0.07) + (count - 1) * 0.04);
    expect(size.z).toBeCloseTo(0.053);
  }
});

it.each([20, 30])("keeps the EDLS %i mm openings distinct within the catalog face width", async (slotMm) => {
  for (let count = 1; count <= 3; count++) {
    const data = readFileSync(`public/models/ecoclima/edls-${slotMm}-${count}.glb`);
    const model = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
    const mesh: Mesh[] = [];
    model.scene.traverse((object) => { if (object instanceof Mesh) mesh.push(object); });
    const walls = mesh.filter((object) => object.name.startsWith("Profile_wall"));
    expect(walls).toHaveLength(count * 2);
    const centers = walls.map((wall) => new Box3().setFromObject(wall).getCenter(new Vector3()).y).sort((a, b) => a - b);
    for (let i = 0; i < count; i++) expect(centers[i * 2 + 1] - centers[i * 2]).toBeCloseTo(slotMm / 1000 - .002, 4);
    const face = new Box3().setFromObject(model.scene).getSize(new Vector3());
    expect(face.y).toBeCloseTo(.04 + count * slotMm / 1000 + (count - 1) * .02, 4);
  }
});

it("loads the detailed EDFL frame with one vane per opening", async () => {
  for (let count = 1; count <= 6; count++) {
    const data = readFileSync(`public/models/ecoclima/edfl-realistic-${count}.glb`);
    const model = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
    const meshes: Mesh[] = [];
    model.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes.filter((mesh) => mesh.name.startsWith("Deflector"))).toHaveLength(count);
    expect(new Box3().setFromObject(model.scene).getSize(new Vector3()).y).toBeCloseTo(.07 + (count - 1) * .04, 4);
  }
});
