"use client";

import * as THREE from "three";

const disc = new THREE.CircleGeometry(1, 48);
const rim = new THREE.RingGeometry(0.94, 1, 48);
const blade = new THREE.SphereGeometry(1, 16, 8);
const recess = new THREE.MeshStandardMaterial({
  color: "#152129",
  roughness: 0.8,
});
const impeller = new THREE.MeshStandardMaterial({
  color: "#39474f",
  roughness: 0.5,
  metalness: 0.3,
});
const metals = ["#c6cecf", "#69747c"].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.35 }),
);
const wires = metals.map(
  (material) => new THREE.LineBasicMaterial({ color: material.color }),
);
const grillePoints: number[] = [];
for (const radius of [0.25, 0.42, 0.59, 0.76, 0.93])
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
for (let i = 0; i < 12; i++) {
  const angle = (i * Math.PI) / 6;
  grillePoints.push(
    0.15 * Math.cos(angle),
    0.15 * Math.sin(angle),
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
}: {
  radiusM: number;
  dark?: boolean;
}) {
  const metal = metals[Number(dark)];
  return (
    <group scale={radiusM} dispose={null}>
      <mesh geometry={disc} material={recess} position={[0, 0, 0.002]} />
      {[0, 1, 2].map((index) => (
        <group key={index} rotation={[0, 0, (index * Math.PI * 2) / 3]}>
          <mesh
            geometry={blade}
            material={impeller}
            position={[0, 0.43, 0.014]}
            rotation={[0, 0, -0.4]}
            scale={[0.24, 0.44, 0.015]}
          />
        </group>
      ))}
      <lineSegments
        geometry={outdoorFanGrille}
        material={wires[Number(dark)]}
        position={[0, 0, 0.04]}
      />
      <mesh geometry={rim} material={metal} position={[0, 0, 0.045]} />
      <mesh
        geometry={disc}
        material={metal}
        position={[0, 0, 0.05]}
        scale={0.15}
      />
    </group>
  );
}
