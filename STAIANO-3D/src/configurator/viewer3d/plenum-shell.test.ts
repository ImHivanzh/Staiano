import { expect, it } from "vitest";
import * as THREE from "three";
import { attachedPlenumFaces, plenumFaceGeometry } from "./plenum-shell";

it("cuts each circular port while retaining the surrounding sheet", () => {
  const geometry = plenumFaceGeometry(0.8, 0.3, [
    { x: -0.25, y: 0, radius: 0.07 },
    { x: 0, y: 0, radius: 0.07 },
    { x: 0.25, y: 0, radius: 0.07 },
  ]);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster();
  for (const x of [-0.25, 0, 0.25]) {
    ray.set(new THREE.Vector3(x, 0, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(mesh)).toHaveLength(0);
  }
  ray.set(new THREE.Vector3(0.12, 0, 1), new THREE.Vector3(0, 0, -1));
  expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
  geometry.dispose();
  material.dispose();
});

it("leaves a rectangular grille inlet open with a metal flange and inward sheet thickness", () => {
  const geometry = plenumFaceGeometry(0.6, 0.4, [], {
    width: 0.576,
    height: 0.376,
  });
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const face = new THREE.Mesh(geometry, material);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(0, 0, 0.1),
    new THREE.Vector3(0, 0, -1),
  );
  expect(ray.intersectObject(face)).toHaveLength(0);
  ray.ray.origin.x = 0.295;
  expect(ray.intersectObject(face).length).toBeGreaterThan(0);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.min.z).toBeCloseTo(-0.0015);
  expect(geometry.boundingBox!.max.z).toBeCloseTo(0);
  expect(geometry.groups.length).toBeLessThanOrEqual(3);
  geometry.dispose();
  material.dispose();
});

it("keeps off-centre duct openings aligned on all six faces", () => {
  const faces = attachedPlenumFaces(
    0.8,
    0.4,
    0.3,
    [
      { side: "front", x: 0.15, y: 0.15, z: 0.07, radius: 0.025 },
      { side: "rear", x: 0.15, y: -0.15, z: 0.07, radius: 0.025 },
      { side: "top", x: 0.15, y: 0.06, z: 0.2, radius: 0.025 },
      { side: "bottom", x: 0.15, y: 0.06, z: -0.2, radius: 0.025 },
      { side: "left", x: -0.4, y: 0.06, z: 0.07, radius: 0.025 },
      { side: "right", x: 0.4, y: 0.06, z: 0.07, radius: 0.025 },
    ],
    null,
  );
  const centres = [
    [0.15, 0.07, 0.15],
    [0.15, 0.07, -0.15],
    [0.15, 0.2, 0.06],
    [0.15, -0.2, 0.06],
    [-0.4, 0.07, 0.06],
    [0.4, 0.07, 0.06],
  ];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const mesh = new THREE.Mesh(face.geometry, material);
    mesh.position.set(...face.position);
    mesh.rotation.set(...face.rotation);
    mesh.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation);
    const centre = new THREE.Vector3(
      ...(centres[i] as [number, number, number]),
    );
    const ray = new THREE.Raycaster(
      centre.clone().addScaledVector(normal, 0.1),
      normal.clone().negate(),
    );
    expect(ray.intersectObject(mesh), face.side).toHaveLength(0);
    face.geometry.dispose();
  }
  material.dispose();
});

it("opens the EDSC bottom outlet independently of its lateral duct inlet", () => {
  const faces = attachedPlenumFaces(
    0.3,
    0.25,
    0.3,
    [{ side: "rear", x: 0, y: -0.15, z: 0, radius: 0.0625 }],
    { side: "bottom", radius: 0.0625 },
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const face of faces.filter(
    (face) => face.side === "bottom" || face.side === "rear",
  )) {
    const mesh = new THREE.Mesh(face.geometry, material);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );
    expect(ray.intersectObject(mesh), face.side).toHaveLength(0);
  }
  faces.forEach((face) => face.geometry.dispose());
  material.dispose();
});
