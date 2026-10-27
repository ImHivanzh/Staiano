import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, Mesh, Vector3 } from "three";

it.each(["u-match-ducted-realistic.glb", "versati-iii-sp-08-10.glb"])("loads the converted Gree body %s and can fit it to catalog dimensions", async (file) => {
  const data = readFileSync(`public/models/gree/${file}`);
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  const body: Mesh[] = [];
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && !["Gree Products_Azul", "Gree Products_Naranja", "Gree Products_Service space"].includes(object.material.name)) body.push(object);
  });
  expect(body.length).toBeGreaterThan(0);
  const bounds = new Box3();
  for (const mesh of body) bounds.union(new Box3().setFromObject(mesh));
  const size = bounds.getSize(new Vector3());
  expect([size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  const fitted = size.clone().multiply(new Vector3(1 / size.x, 0.2 / size.y, 0.45 / size.z));
  expect(fitted.x).toBeCloseTo(1);
  expect(fitted.y).toBeCloseTo(0.2);
  expect(fitted.z).toBeCloseTo(0.45);
});
