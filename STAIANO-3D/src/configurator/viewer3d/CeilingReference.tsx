"use client";
import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Room } from "@/schemas/project";

/** Toggleable suspended-ceiling layer; visible only where the operator measured one. */
export function SuspendedCeiling({ room }: { room: Room }) {
  const height = room.ceilingHeightM;
  const geometry = useMemo(() => {
    if (height === null) return null;
    const shape = new THREE.Shape();
    room.polygon.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y),
    );
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [room.polygon, height]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (height === null || !geometry) return null;
  const points = room.polygon.map(
    (p) => [p.x, height, p.y] as [number, number, number],
  );
  points.push(points[0]);
  return (
    <group name={`Controsoffitto ${room.name}`}>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, height, 0]}
        raycast={() => undefined}
      >
        <meshStandardMaterial
          color="#eef4f5"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={points}
        color="#4f7f8c"
        transparent
        opacity={0.65}
        lineWidth={1.1}
        dashed
        dashSize={0.12}
        gapSize={0.06}
        raycast={() => undefined}
      />
    </group>
  );
}

/** A section reference at the measured room height; never a fabricated suspended ceiling. */
export function CeilingReference({ room }: { room: Room }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    room.polygon.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y),
    );
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [room.polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const points = room.polygon.map(
    (p) => [p.x, room.heightM, p.y] as [number, number, number],
  );
  points.push(points[0]);
  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, room.heightM + 0.003, 0]}
        raycast={() => undefined}
      >
        <meshBasicMaterial
          color="#f9fcff"
          transparent
          opacity={0.085}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={points}
        color="#718891"
        transparent
        opacity={0.32}
        lineWidth={0.8}
        dashed
        dashSize={0.09}
        gapSize={0.08}
        raycast={() => undefined}
      />
    </group>
  );
}
