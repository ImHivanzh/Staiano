"use client";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Room } from "@/schemas/project";

/** Labels stay in the application React root; the scene only projects coordinates. */
export function RoomLabelProjection({
  rooms,
  elements,
}: {
  rooms: readonly Room[];
  elements: RefObject<Map<string, HTMLButtonElement>>;
}) {
  useFrame(({ camera, size }) => {
    const projected = new THREE.Vector3();
    for (const room of rooms) {
      const label = elements.current.get(room.id);
      if (!label) continue;
      projected.set(room.centroid.x, 0.03, room.centroid.y).project(camera);
      label.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px,${((1 - projected.y) / 2) * size.height}px) translate(-50%,-50%)`;
      label.style.visibility =
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
          ? "hidden"
          : "visible";
    }
  });
  return null;
}
