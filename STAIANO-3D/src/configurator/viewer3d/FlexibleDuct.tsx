"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RoutePoint } from "@/domain/ducted/routes";
import { flexibleDuctCurve } from "@/domain/ducted/flexible-curve";
import { Html } from "@react-three/drei";

export function FlexibleDuct({
  points,
  diameterMm,
  color,
  fallbackPoint,
}: {
  points: RoutePoint[];
  diameterMm: number;
  color: string;
  fallbackPoint?: RoutePoint;
}) {
  const shape = useMemo(() => {
    const path = flexibleDuctCurve(points, diameterMm);
    if (!path) return null;
    const { curve } = path;
    const length = curve.getLength();
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.min(512, Math.max(24, Math.ceil(length * 35))),
      diameterMm / 2000,
      16,
      false,
    );
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 4;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 32, 0);
    gradient.addColorStop(0, "#555555");
    gradient.addColorStop(0.4, "#eeeeee");
    gradient.addColorStop(1, "#555555");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(length / 0.025, 1);
    return { geometry, texture };
  }, [points, diameterMm]);
  useEffect(
    () => () => {
      shape?.geometry.dispose();
      shape?.texture.dispose();
    },
    [shape],
  );
  const warningPoint = points[0] ?? fallbackPoint;
  return shape ? (
    <mesh geometry={shape.geometry}>
      <meshStandardMaterial
        color={color}
        metalness={0.2}
        roughness={0.55}
        bumpMap={shape.texture}
        bumpScale={0.012}
        side={THREE.DoubleSide}
      />
    </mesh>
  ) : warningPoint ? (
    <Html
      position={[
        warningPoint.x,
        warningPoint.elevationM + 0.15,
        warningPoint.y,
      ]}
    >
      <span
        role="status"
        style={{
          background: "#fff",
          color: "#a12525",
          padding: "6px",
          whiteSpace: "nowrap",
        }}
      >
        Percorso non realizzabile: sposta curve o plenum
      </span>
    </Html>
  ) : null;
}
