"use client";

import * as THREE from "three";
import { OutdoorFan } from "./OutdoorFan";

const box = new THREE.BoxGeometry(1, 1, 1);
const finishes = ["#f0f0ed", "#7a7e83", "#bfdde0"].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.22, roughness: 0.42 }),
);
const feet = new THREE.MeshStandardMaterial({
  color: "#252e35",
  roughness: 0.65,
});

/** Casing and illustrative feet share the complete saved height, without a gap. */
export function OutdoorCabinet({
  widthM: w,
  heightM: h,
  depthM: d,
  selected = false,
  dark = false,
}: {
  widthM: number;
  heightM: number;
  depthM: number;
  selected?: boolean;
  dark?: boolean;
}) {
  const footHeight = Math.min(0.03, h * 0.1);
  return (
    <group dispose={null}>
      <mesh
        geometry={box}
        material={finishes[selected ? 2 : Number(dark)]}
        position={[0, footHeight / 2, 0]}
        scale={[w, h - footHeight, d]}
        castShadow
        receiveShadow
      />
      <group position={[-w * 0.18, 0, d / 2 + 0.002]}>
        <OutdoorFan radiusM={Math.min(w * 0.28, h * 0.34)} dark={dark} />
      </group>
      {[-1, 1].map((sign) => (
        <mesh
          key={sign}
          geometry={box}
          material={feet}
          position={[sign * w * 0.32, -h / 2 + footHeight / 2, 0]}
          scale={[Math.min(0.08, w * 0.2), footHeight, d]}
        />
      ))}
    </group>
  );
}
