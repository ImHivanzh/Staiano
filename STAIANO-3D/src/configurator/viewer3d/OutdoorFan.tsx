"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const disc = new THREE.CircleGeometry(1, 48);
const rim = new THREE.RingGeometry(0.94, 1, 48);
const hub = new THREE.CylinderGeometry(1, 0.8, 1, 24);
hub.rotateX(Math.PI / 2);
const shroud = new THREE.TorusGeometry(0.97, 0.03, 8, 64);
const BLADES = 7;
/** Swept, pitched axial blade (unit radius): wide tip, narrow root, twisted like a moulded impeller. */
const blade = (() => {
  const rows = 12,
    cols = 6,
    positions: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows,
      radius = 0.17 + 0.77 * t,
      chord = 0.1 + 0.34 * Math.sin(Math.PI * t * 0.92) ** 0.6,
      pitch = 0.5 - 0.25 * t;
    for (let col = 0; col <= cols; col++) {
      const u = col / cols - 0.5,
        angle = -0.55 * t + u * chord;
      positions.push(
        radius * Math.cos(angle),
        radius * Math.sin(angle),
        u * chord * radius * pitch * 0.9,
      );
    }
  }
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      indices.push(a, a + 1, a + cols + 2, a, a + cols + 2, a + cols + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
})();
const recess = new THREE.MeshStandardMaterial({
  color: "#152129",
  roughness: 0.8,
});
const impeller = new THREE.MeshStandardMaterial({
  color: "#323c43",
  roughness: 0.45,
  metalness: 0.15,
  side: THREE.DoubleSide,
});
const metals = ["#a3adb1", "#59646b"].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 }),
);
const wires = metals.map(
  (material) => new THREE.LineBasicMaterial({ color: material.color }),
);
const grillePoints: number[] = [];
for (const radius of [0.3, 0.5, 0.7, 0.93])
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32,
      b = ((i + 1) * Math.PI) / 32;
    grillePoints.push(
      radius * Math.cos(a),
      radius * Math.sin(a),
      0,
      radius * Math.cos(b),
      radius * Math.sin(b),
      0,
    );
  }
for (let i = 0; i < 32; i++) {
  const angle = (i * Math.PI) / 16;
  grillePoints.push(
    0.18 * Math.cos(angle),
    0.18 * Math.sin(angle),
    0,
    0.94 * Math.cos(angle),
    0.94 * Math.sin(angle),
    0,
  );
}
/** Unit-radius grille, shared by every outdoor fan in one draw call. */
export const outdoorFanGrille = new THREE.BufferGeometry();
outdoorFanGrille.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(grillePoints, 3),
);

/** Illustrative fan detail; its radius and position stay within the saved enclosure. */
export function OutdoorFan({
  radiusM,
  dark = false,
  running = false,
}: {
  radiusM: number;
  dark?: boolean;
  running?: boolean;
}) {
  const metal = metals[Number(dark)];
  const blades = useRef<THREE.Group>(null);
  useFrame(({ invalidate }, delta) => {
    if (!running || !blades.current) return;
    blades.current.rotation.z -= delta * 14;
    invalidate();
  });
  return (
    <group scale={radiusM} dispose={null}>
      <mesh geometry={disc} material={recess} position={[0, 0, 0.002]} />
      <group ref={blades}>
        {Array.from({ length: BLADES }, (_, index) => (
          <mesh
            key={index}
            geometry={blade}
            material={impeller}
            position={[0, 0, 0.012]}
            rotation={[0, 0, (index * Math.PI * 2) / BLADES]}
          />
        ))}
        <mesh
          geometry={hub}
          material={impeller}
          position={[0, 0, 0.025]}
          scale={[0.2, 0.2, 0.05]}
        />
      </group>
      <lineSegments
        geometry={outdoorFanGrille}
        material={wires[Number(dark)]}
        position={[0, 0, 0.04]}
      />
      <mesh geometry={rim} material={metal} position={[0, 0, 0.045]} />
      <mesh geometry={shroud} material={metal} position={[0, 0, 0.02]} />
      <mesh
        geometry={disc}
        material={metal}
        position={[0, 0, 0.05]}
        scale={0.17}
      />
    </group>
  );
}
