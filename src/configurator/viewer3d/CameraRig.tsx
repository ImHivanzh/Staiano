"use client";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Room, Wall } from "@/schemas/project";
import { cameraCutWalls, type SceneFrame } from "./scene-layout";

export function CameraRig({
  frame,
  top,
  fitKey,
  walls,
  rooms,
  cutaway,
  onCutWalls,
  viewRotation,
  underside,
}: {
  frame: SceneFrame;
  top: boolean;
  fitKey: string;
  walls: Wall[];
  rooms: Room[];
  cutaway: boolean;
  onCutWalls: (ids: Set<string>) => void;
  viewRotation?: number;
  underside?: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const previous = useRef("");
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const base = frame.base ?? 0;
    const target = new THREE.Vector3(
      (frame.minX + frame.maxX) / 2,
      top ? base : base + (frame.height - base) * 0.32,
      (frame.minZ + frame.maxZ) / 2,
    );
    const direction = top
      ? new THREE.Vector3(0, 1, 0.0001)
      : viewRotation !== undefined
        ? new THREE.Vector3(
            0.45 * Math.cos(viewRotation) - Math.sin(viewRotation),
            underside ? -0.65 : 0.38,
            0.45 * Math.sin(viewRotation) + Math.cos(viewRotation),
          )
        : new THREE.Vector3(1, 0.92, 1.2);
    direction.normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = (tanV * size.width) / Math.max(1, size.height);
    let distance = 0.8;
    for (const x of [frame.minX, frame.maxX])
      for (const y of [base, frame.height])
        for (const z of [frame.minZ, frame.maxZ]) {
          const offset = new THREE.Vector3(x, y, z).sub(target);
          distance = Math.max(
            distance,
            offset.dot(direction) +
              Math.max(
                (Math.abs(offset.dot(right)) / tanH) * 1.12,
                (Math.abs(offset.dot(up)) / tanV) * 1.25,
              ),
          );
        }
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (controls.current) {
      controls.current.target.copy(target);
      controls.current.update();
    }
    invalidate();
  }, [
    camera,
    frame.minX,
    frame.maxX,
    frame.minZ,
    frame.maxZ,
    frame.height,
    frame.base,
    size.width,
    size.height,
    top,
    viewRotation,
    underside,
    fitKey,
    invalidate,
  ]);
  useFrame(() => {
    const ids = cutaway
      ? cameraCutWalls(walls, rooms, camera.position, top)
      : new Set<string>();
    const key = [...ids].join("|");
    if (previous.current !== key) {
      previous.current = key;
      onCutWalls(ids);
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={0.2}
      maxDistance={2000}
      maxPolarAngle={underside ? Math.PI * 0.85 : Math.PI / 2 - 0.03}
      screenSpacePanning
    />
  );
}
