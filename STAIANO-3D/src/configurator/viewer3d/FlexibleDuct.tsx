"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { RoutePoint } from "@/domain/ducted/routes";
import { flexibleDuctCurve } from "@/domain/ducted/flexible-curve";
import type { DuctCollision } from "@/domain/ducted/collisions";
import { flexibleDuctInsulationMm } from "@/domain/catalogs/flexible-ducts";
import { flexibleDuctGeometry, flexibleFoilTexture } from "./flexible-duct-geometry";

const foilHeight = flexibleFoilTexture();

export function FlexibleDuct({
  points,
  diameterMm,
  flexibleProductId,
  color,
  fallbackPoint,
  collision,
  warnings = true,
}: {
  points: RoutePoint[];
  diameterMm: number;
  flexibleProductId?: string;
  color: string;
  fallbackPoint?: RoutePoint;
  collision?: DuctCollision;
  /** Avvisi di collisione e percorso: solo in modifica, mai in Vista Cliente. */
  warnings?: boolean;
}) {
  const shape = useMemo(() => {
    const path = flexibleDuctCurve(points, diameterMm, flexibleProductId);
    if (!path) return null;
    const geometry = flexibleDuctGeometry(path.curve, diameterMm, flexibleDuctInsulationMm(flexibleProductId));
    const texture = foilHeight.clone();
    texture.repeat.set(geometry.length / .2, Math.PI * 2 * geometry.outerRadius / .2);
    return { ...geometry, texture };
  }, [points, diameterMm, flexibleProductId]);
  useEffect(
    () => () => {
      shape?.foil.dispose();
      shape?.liner?.dispose();
      shape?.ends.forEach((end) => end.dispose());
      shape?.texture.dispose();
    },
    [shape],
  );
  const warningPoint = collision?.point ?? points[0] ?? fallbackPoint;
  const { gl } = useThree();
  const warning = useRef<HTMLSpanElement | null>(null);
  const projected = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (!warnings || (shape && !collision) || !warningPoint) return;
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
  }, [gl, shape, warningPoint, collision, warnings]);
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
    <group>
    <mesh geometry={shape.foil} castShadow receiveShadow>
      <meshStandardMaterial attach="material-0"
        color={color}
        metalness={flexibleProductId === "ecoclima-etf10" ? .15 : .85}
        roughness={.45}
        bumpMap={shape.texture}
        roughnessMap={shape.texture}
        bumpScale={.004}
        side={THREE.DoubleSide}
      />
      <meshStandardMaterial attach="material-1" color={color} metalness={.9} roughness={.3} side={THREE.DoubleSide} />
    </mesh>
    {shape.liner && <mesh geometry={shape.liner} receiveShadow>
      <meshStandardMaterial attach="material-0" color="#c9c8b4" metalness={.25} roughness={.75} side={THREE.DoubleSide} bumpMap={shape.texture} bumpScale={.0003} />
      <meshStandardMaterial attach="material-1" color={color} metalness={.9} roughness={.3} side={THREE.DoubleSide} />
    </mesh>}
    {shape.ends.map((end, index) => <mesh key={index} geometry={end}>
      <meshStandardMaterial color="#c6bfa5" roughness={1} side={THREE.DoubleSide} bumpMap={shape.texture} bumpScale={.001} />
    </mesh>)}
    </group>
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
