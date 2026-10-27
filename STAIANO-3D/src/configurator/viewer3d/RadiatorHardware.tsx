"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { resolveInstalledRadiatorFinish } from "@/domain/catalogs/radiator-finishes";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { globalSectionFor } from "@/domain/catalogs/global-sections";
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
  const variant = radiatorProductAtVersion(item.productId, item.catalogVersion);
  const globalSection = globalSectionFor(item, variant);
  if (globalSection)
    return (
      <GlobalHardware
        width={item.widthMm / 1000}
        height={h}
        depth={depth}
        connectionY={-h / 2 + globalSection.connectionAboveBottomM}
        materials={materials}
        hasPipeCover={Boolean(finishes[2])}
      />
    );
  const connections = radiatorConnectionXs(item, variant);
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

/** Global VIP/OSCAR: side valve and lockshield on the bottom connections, vent on top. */
function GlobalHardware({
  width,
  height,
  depth,
  connectionY,
  materials,
  hasPipeCover,
}: {
  width: number;
  height: number;
  depth: number;
  connectionY: number;
  materials: THREE.Material[];
  hasPipeCover: boolean;
}) {
  const z = Math.min(depth / 2 - 0.0325, 0.04);
  return (
    <group>
      {[-1, 1].map((side, index) => (
        <group key={side} position={[side * width / 2, connectionY, z]}>
          {[
            [0.006, 0.012, 0.016],
            [0.027, 0.03, 0.0125],
            [0.051, 0.018, 0.02],
          ].map(([x, length, radius]) => (
            <mesh
              key={x}
              position={[side * x, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              material={materials[index]}
              castShadow
            >
              <cylinderGeometry args={[radius, radius, length, 24]} />
            </mesh>
          ))}
          {hasPipeCover && (
            <mesh position={[side * 0.027, -0.045, 0]} material={materials[2]} castShadow>
              <cylinderGeometry args={[0.011, 0.011, 0.09, 20]} />
            </mesh>
          )}
        </group>
      ))}
      <mesh position={[width / 2 - 0.04, height / 2 + 0.004, 0]} material={materials[0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.016, 16]} />
      </mesh>
    </group>
  );
}
