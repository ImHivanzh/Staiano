"use client";
import { useMemo, useEffect } from "react";
import * as THREE from "three";
import type { Room } from "@/schemas/project";

function RoomLoad({ room, ratio }: { room: Room; ratio: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    room.polygon.forEach((p, i) =>
      i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y),
    );
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [room.polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = new THREE.Color("#42b2c2").lerp(
    new THREE.Color("#e0a65a"),
    ratio,
  );
  return (
    <mesh
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.014, 0]}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.65}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function LoadMap({ rooms }: { rooms: Room[] }) {
  const maximum = Math.max(1, ...rooms.map((r) => r.designLoadW));
  return (
    <group>
      {rooms
        .filter((r) => r.geometryStatus === "closed")
        .map((room) => (
          <RoomLoad
            key={room.id}
            room={room}
            ratio={room.designLoadW / maximum}
          />
        ))}
    </group>
  );
}
