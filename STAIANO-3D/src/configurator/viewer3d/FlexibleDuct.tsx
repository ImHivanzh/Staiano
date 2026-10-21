"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { RoutePoint } from "@/domain/ducted/routes";
import { flexibleDuctCurve } from "@/domain/ducted/flexible-curve";
import type { DuctCollision } from "@/domain/ducted/collisions";

export function FlexibleDuct({
  points,
  diameterMm,
  color,
  fallbackPoint,
  collision,
}: {
  points: RoutePoint[];
  diameterMm: number;
  color: string;
  fallbackPoint?: RoutePoint;
  collision?: DuctCollision;
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
  const warningPoint = collision?.point ?? points[0] ?? fallbackPoint;
  const { gl } = useThree();
  const warning = useRef<HTMLSpanElement | null>(null);
  const projected = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if ((shape && !collision) || !warningPoint) return;
    // A DOM label needs no nested React root, which cannot unmount during a scene render.
    const element = document.createElement("span");
    element.setAttribute("role", collision ? "alert" : "status");
    element.textContent =
      collision?.message ?? "Percorso non realizzabile: sposta curve o plenum";
    Object.assign(element.style, {
      position: "absolute",
      top: "0",
      left: "0",
      background: "#fff",
      color: "#a12525",
      padding: "6px",
      whiteSpace: collision ? "normal" : "nowrap",
      maxWidth: collision ? "min(360px, calc(100vw - 32px))" : "none",
      pointerEvents: "none",
    });
    gl.domElement.parentElement?.appendChild(element);
    warning.current = element;
    return () => {
      warning.current = null;
      element.remove();
    };
  }, [gl, shape, warningPoint, collision]);
  useFrame(({ camera, size }) => {
    if (!warning.current || !warningPoint) return;
    projected
      .set(warningPoint.x, warningPoint.elevationM + 0.15, warningPoint.y)
      .project(camera);
    warning.current.style.transform = `translate(${((projected.x + 1) / 2) * size.width}px,${((1 - projected.y) / 2) * size.height}px)`;
    warning.current.style.visibility =
      Math.abs(projected.z) > 1 ||
      Math.abs(projected.x) > 1 ||
      Math.abs(projected.y) > 1
        ? "hidden"
        : "visible";
  });
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
  ) : points.length > 1 ? (
    <group>
      <Line
        points={points.map((point) => [point.x, point.elevationM, point.y])}
        color="#bd3434"
        lineWidth={2}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />
      <Line
        points={points.map((point) => [point.x, point.elevationM, point.y])}
        lineWidth={18}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </group>
  ) : null;
}
