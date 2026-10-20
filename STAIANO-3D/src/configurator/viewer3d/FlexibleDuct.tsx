"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RoutePoint } from "@/domain/ducted/routes";

export function FlexibleDuct({
  points,
  diameterMm,
  color,
}: {
  points: RoutePoint[];
  diameterMm: number;
  color: string;
}) {
  const shape = useMemo(() => {
    const vertices = points
      .filter(
        (p, i) =>
          !i ||
          Math.hypot(
            p.x - points[i - 1].x,
            p.y - points[i - 1].y,
            p.elevationM - points[i - 1].elevationM,
          ) > 0.001,
      )
      .map((p) => new THREE.Vector3(p.x, p.elevationM, p.y));
    if (vertices.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(vertices, false, "centripetal");
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
  ) : null;
}
