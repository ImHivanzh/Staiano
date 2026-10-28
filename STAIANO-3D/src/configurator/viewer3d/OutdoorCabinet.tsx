"use client";

import { lazy, Suspense } from "react";
import * as THREE from "three";
import { OutdoorFan } from "./OutdoorFan";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import { outdoorFanPlate, outdoorShellClass, outdoorShellUrl } from "@/domain/catalogs/outdoor-shells";

const OutdoorShellBody = lazy(() => import("./SplitWallBody"));
const bezel = new THREE.RingGeometry(1, 1.16, 48);

const box = new THREE.BoxGeometry(1, 1, 1);
const finishes = ["#f0f0ed", "#7a7e83", "#bfdde0"].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.22, roughness: 0.42 }),
);
const feet = new THREE.MeshStandardMaterial({
  color: "#252e35",
  roughness: 0.65,
});
const shadow = new THREE.MeshStandardMaterial({
  color: "#20272b",
  roughness: 0.8,
});
const darkCoating = new THREE.MeshStandardMaterial({
  color: "#44484b",
  roughness: 0.45,
  metalness: 0.2,
});

/** Casing and illustrative feet share the complete saved height, without a gap. */
export function OutdoorCabinet({
  widthM: w,
  heightM: h,
  depthM: d,
  selected = false,
  dark = false,
  family = "",
  running = false,
  shell = false,
}: {
  widthM: number;
  heightM: number;
  depthM: number;
  selected?: boolean;
  dark?: boolean;
  family?: string;
  running?: boolean;
  /** Use the reconstructed split/VRV casing; false keeps the generic box (heat pumps have their own models). */
  shell?: boolean;
}) {
  const footHeight = Math.min(0.03, h * 0.1);
  const screen = /^Altherma 3 (R MT|H HT)$/.test(family);
  const square = family === "VERSATI V";
  // shortcut: unseen fan topology uses casing proportions; replace with per-model topology when OEM meshes are available.
  const fans = h > 1.3 ? [-h * 0.23, h * 0.23] : [0];
  const radius = Math.min(w * 0.28, (h * 0.34) / fans.length);
  if (shell) {
    const plate = outdoorFanPlate(w);
    const wide = w > 1.2 && h <= 1.3;
    const bodyHeight = h - footHeight - 0.032;
    const fanRadius = Math.min(
      wide ? plate.width * 0.23 : plate.width * 0.46,
      (bodyHeight * 0.46) / (h > 1.3 ? 2 : 1),
    );
    const centreX = plate.left + plate.width / 2;
    const placements: [number, number][] = h > 1.3
      ? fans.map((y) => [centreX, y])
      : wide
        ? [[centreX - plate.width * 0.25, 0], [centreX + plate.width * 0.25, 0]]
        : [[centreX, footHeight / 2]];
    const casing = (
      <mesh geometry={box} material={finishes[Number(dark)]} position={[0, footHeight / 2, 0]} scale={[w, h - footHeight, d]} castShadow receiveShadow />
    );
    return (
      <group dispose={null}>
        <ModelAssetBoundary fallback={casing}>
          <Suspense fallback={casing}>
            <OutdoorShellBody url={outdoorShellUrl(outdoorShellClass(w, h))} width={w} height={h} depth={d} />
          </Suspense>
        </ModelAssetBoundary>
        {placements.map(([x, y]) => (
          <group key={`${x}-${y}`} position={[x, y, d / 2 + 0.0015]}>
            <OutdoorFan radiusM={fanRadius} dark={dark} running={running} />
            <mesh geometry={bezel} material={finishes[0]} scale={fanRadius} position={[0, 0, 0.001]} />
          </group>
        ))}
        {selected && (
          <mesh geometry={box} scale={[w * 1.004, h * 1.004, d * 1.004]} renderOrder={2}>
            <meshBasicMaterial color="#6fb7c8" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        )}
      </group>
    );
  }
  return (
    <group dispose={null}>
      <mesh
        geometry={box}
        material={
          screen || square
            ? selected
              ? finishes[2]
              : darkCoating
            : finishes[selected ? 2 : Number(dark)]
        }
        position={[0, footHeight / 2, 0]}
        scale={[w, h - footHeight, d]}
        castShadow
        receiveShadow
      />
      <group>
        {screen ? (
          <group position={[-w * 0.15, 0, d / 2 + 0.001]}>
            <mesh
              geometry={box}
              material={shadow}
              scale={[w * 0.65, h * 0.85, 0.002]}
            />
            {Array.from({ length: 32 }, (_, i) => (
              <mesh
                key={i}
                geometry={box}
                material={darkCoating}
                position={[0, ((i + 0.5) / 32 - 0.5) * h * 0.85, 0.002]}
                scale={[w * 0.65, h * 0.007, 0.002]}
              />
            ))}
          </group>
        ) : (
          fans.map((y) => (
            <group key={y} position={[-w * 0.18, y, d / 2 + 0.002]}>
              <OutdoorFan
                radiusM={radius}
                dark={dark || square}
                running={running}
              />
              {square &&
                Array.from({ length: 20 }, (_, i) => (
                  <mesh
                    key={i}
                    geometry={box}
                    material={darkCoating}
                    position={[
                      0,
                      ((i + 0.5) / 20 - 0.5) * radius * 2,
                      radius * 0.06,
                    ]}
                    scale={[radius * 2, 0.003, 0.002]}
                  />
                ))}
            </group>
          ))
        )}
        <mesh
          geometry={box}
          material={shadow}
          position={[w * 0.2, footHeight / 2, d / 2 + 0.001]}
          scale={[0.002, h * 0.87, 0.002]}
        />
        <mesh
          geometry={box}
          material={shadow}
          position={[w * 0.33, -h * 0.12, d / 2 + 0.002]}
          scale={[w * 0.09, Math.min(0.025, h * 0.04), 0.002]}
        />
        {Array.from({ length: 16 }, (_, i) => (
          <mesh
            key={i}
            geometry={box}
            material={shadow}
            position={[-w / 2 - 0.0005, ((i + 0.5) / 16 - 0.5) * h * 0.78, 0]}
            scale={[0.001, h * 0.012, d * 0.78]}
          />
        ))}
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
