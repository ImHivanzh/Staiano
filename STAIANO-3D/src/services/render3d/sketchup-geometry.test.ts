import { expect, it } from "vitest";
import * as THREE from "three";
import { sketchupMeshes } from "./sketchup-geometry";
import { sketchupModelSchema } from "@/services/export/sketchup-schema";

it("exports real mesh transforms, grouped materials and every instance with metric Z-up coordinates", () => {
  const root = new THREE.Group();
  root.position.set(10, 0, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  const instance = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#365aa8" }),
    2,
  );
  instance.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 2, 3));
  instance.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 4, 6));
  root.add(instance);
  const hidden = new THREE.Mesh(geometry, instance.material);
  hidden.visible = false;
  root.add(hidden);
  const device = new THREE.Group();
  device.name = "Ventilconvettore";
  device.userData.sketchupGroup = true;
  const extraMaterial = new THREE.MeshBasicMaterial({ color: "#cc5522" });
  device.add(
    new THREE.Mesh(geometry, instance.material),
    new THREE.Mesh(geometry, extraMaterial),
  );
  root.add(device);
  const result = sketchupMeshes(root);
  expect(result).toHaveLength(4);
  expect(result[0].vertices.slice(0, 3)).toEqual([10, -3, 2]);
  expect(result[1].vertices.slice(0, 3)).toEqual([15, -6, 4]);
  expect(result[0].color).toEqual([54, 90, 168, 255]);
  expect(result[2].name).toBe("Ventilconvettore");
  expect(result[2].groupId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(result[2].groupId).toBe(result[3].groupId);
  expect(
    sketchupModelSchema.safeParse({
      name: "Test",
      meshes: result,
      background: null,
    }).success,
  ).toBe(true);
  geometry.dispose();
  (instance.material as THREE.Material).dispose();
  extraMaterial.dispose();
});

it("rejects incomplete triangles and non-finite coordinates at the server boundary", () => {
  const mesh = {
    name: "X",
    color: [0, 0, 0, 255],
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  };
  expect(
    sketchupModelSchema.safeParse({
      name: "Test",
      meshes: [mesh],
      background: null,
    }).success,
  ).toBe(true);
  expect(
    sketchupModelSchema.safeParse({
      name: "Test",
      meshes: [{ ...mesh, vertices: [...mesh.vertices, 0] }],
      background: null,
    }).success,
  ).toBe(false);
  expect(
    sketchupModelSchema.safeParse({
      name: "Test",
      meshes: [{ ...mesh, vertices: [NaN, ...mesh.vertices.slice(1)] }],
      background: null,
    }).success,
  ).toBe(false);
  expect(
    sketchupModelSchema.safeParse({
      name: "Test",
      meshes: [{ ...mesh, groupId: "arbitrary" }],
      background: null,
    }).success,
  ).toBe(false);
});
