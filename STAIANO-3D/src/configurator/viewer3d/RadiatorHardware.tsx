"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { resolveInstalledRadiatorFinish } from "@/domain/catalogs/radiator-finishes";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { radiatorConnectionXs } from "./device-detail";

/** Decorative installation details; colour choices remain independent of thermal sizing. */
export function RadiatorHardware({
  item,
}: {
  item: Project["radiators"][number];
}) {
  const finishes = useMemo(
    () => [
      resolveInstalledRadiatorFinish(item, "valve"),
      resolveInstalledRadiatorFinish(item, "lockshield"),
      resolveInstalledRadiatorFinish(item, "pipeCover"),
    ],
    [item],
  );
  const materials = useMemo(
    () =>
      finishes.map(
        (f) =>
          new THREE.MeshStandardMaterial({
            color: f?.colorHex ?? "#c6cbd0",
            metalness: f && f.kind !== "metal" ? 0.08 : 0.75,
            roughness: f && f.kind !== "metal" ? 0.3 : 0.2,
          }),
      ),
    [finishes],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const h = item.heightMm / 1000,
    depth = item.depthMm / 1000;
  const connections = radiatorConnectionXs(
    item,
    radiatorProductAtVersion(item.productId, item.catalogVersion),
  );
  return (
    <group>
      {connections.map((x, index) => {
        const side = index === 0 ? -1 : 1;
        return (
          <group
            key={side}
            position={[
              x,
              -h / 2,
              item.manufacturer === "Lazzarini" &&
              item.family.startsWith("Garda ")
                ? 0
                : Math.min(depth / 2, 0.04),
            ]}
          >
            <mesh
              position={[0, 0.008, 0]}
              material={materials[index]}
              castShadow
            >
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
        );
      })}
    </group>
  );
}
