"use client";
import { useEffect, useMemo } from "react";
import type { Room } from "@/schemas/project";
import { foundationGeometry, groundTexture } from "./site-geometry";

/** Illustrative surroundings give the measured architecture a ground plane and scale. */
export function SiteContext({
  rooms,
  x,
  z,
  span,
}: {
  rooms: readonly Room[];
  x: number;
  z: number;
  span: number;
}) {
  const ground = useMemo(() => groundTexture(), []);
  const foundations = useMemo(
    () =>
      rooms
        .filter((r) => r.geometryStatus === "closed")
        .map((r) => foundationGeometry(r.polygon)),
    [rooms],
  );
  useEffect(() => () => ground.dispose(), [ground]);
  useEffect(() => () => foundations.forEach((g) => g.dispose()), [foundations]);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[x, -0.34, z]}
        receiveShadow
      >
        <planeGeometry args={[span * 100, span * 100]} />
        <meshStandardMaterial map={ground} roughness={1} color="#cbd0bc" />
      </mesh>
      {foundations.map((geometry, index) => (
        <mesh key={index} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#b9ad98" roughness={0.94} />
        </mesh>
      ))}
    </group>
  );
}
