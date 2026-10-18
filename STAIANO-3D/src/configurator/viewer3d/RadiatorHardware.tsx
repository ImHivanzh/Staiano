"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { resolveRadiatorFinish } from "@/domain/catalogs/radiator-finishes";

/** Decorative installation details; colour choices remain independent of thermal sizing. */
export function RadiatorHardware({
  item,
}: {
  item: Project["radiators"][number];
}) {
  const finishes = useMemo(
    () => [
      resolveRadiatorFinish(
        item.manufacturer,
        item.family,
        "valve",
        item.finishes?.valveColorId,
      ),
      resolveRadiatorFinish(
        item.manufacturer,
        item.family,
        "lockshield",
        item.finishes?.lockshieldColorId,
      ),
      resolveRadiatorFinish(
        item.manufacturer,
        item.family,
        "pipeCover",
        item.finishes?.pipeCoverColorId,
      ),
    ],
    [
      item.manufacturer,
      item.family,
      item.finishes?.valveColorId,
      item.finishes?.lockshieldColorId,
      item.finishes?.pipeCoverColorId,
    ],
  );
  const materials = useMemo(
    () =>
      finishes.map(
        (f) =>
          new THREE.MeshStandardMaterial({
            color: f?.colorHex ?? "#c6cbd0",
            metalness: f?.kind === "paint" ? 0.08 : 0.75,
            roughness: f?.kind === "paint" ? 0.3 : 0.2,
          }),
      ),
    [finishes],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const h = item.heightMm / 1000,
    w = item.widthMm / 1000,
    depth = item.depthMm / 1000;
  if (!item.finishes) return null;
  return (
    <group>
      {[-1, 1].map((side, index) => (
        <group
          key={side}
          position={[side * (w / 2 - 0.025), -h / 2, Math.min(depth / 2, 0.04)]}
        >
          <mesh position={[0, 0.008, 0]} material={materials[index]} castShadow>
            <cylinderGeometry args={[0.017, 0.017, 0.045, 16]} />
          </mesh>
          <mesh
            position={[side * 0.018, 0.012, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials[index]}
            castShadow
          >
            <cylinderGeometry args={[0.011, 0.011, 0.035, 12]} />
          </mesh>
          {finishes[2] && (
            <mesh position={[0, -0.05, 0]} material={materials[2]} castShadow>
              <cylinderGeometry args={[0.012, 0.012, 0.1, 20]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
