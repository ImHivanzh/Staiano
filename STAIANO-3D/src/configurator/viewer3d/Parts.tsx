"use client";
import { useRef, useLayoutEffect, useEffect } from "react";
import * as THREE from "three";
import type { DetailPart } from "./device-detail";
/** Each repeated section/fin is a GPU instance, not a separate React mesh. */
export function Parts({
  parts,
  geometry,
  material,
}: {
  parts: DetailPart[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // R3F rebuilds the mesh when constructor arguments change, even with identical transforms.
  useEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [parts.length, geometry, material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    parts.forEach((part, index) => {
      transform.position.set(...part.position);
      transform.scale.set(...part.scale);
      transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts, geometry, material]);
  if (!parts.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
