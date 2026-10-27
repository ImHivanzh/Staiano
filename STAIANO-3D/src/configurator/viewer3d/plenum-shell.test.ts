import { expect, it } from "vitest";
import * as THREE from "three";
import { plenumFaceGeometry } from "./plenum-shell";

it("cuts each circular port while retaining the surrounding sheet", () => {
  const geometry = plenumFaceGeometry(.8, .3, [
    { x: -.25, y: 0, radius: .07 },
    { x: 0, y: 0, radius: .07 },
    { x: .25, y: 0, radius: .07 },
  ]);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster();
  for (const x of [-.25, 0, .25]) {
    ray.set(new THREE.Vector3(x, 0, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
  }
  ray.set(new THREE.Vector3(.12, 0, 1), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  geometry.dispose(); material.dispose();
});
