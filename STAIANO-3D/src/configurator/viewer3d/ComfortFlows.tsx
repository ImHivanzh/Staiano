"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { comfortFields, type ComfortMode } from "./comfort-fields";
import { comfortFlowCurve } from "./comfort-curve";

const STRANDS = 5;
const SEGMENTS = 48;

const vertexShader = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec3 aFlow; // x: side -1..1, y: position along the flow 0..1, z: strand seed
  uniform float uWidth;
  varying vec3 vFlow;
  void main() {
    vFlow = aFlow;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec3 along = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec3 across = normalize(cross(along, vec3(0.0, 0.0, 1.0)));
    float t = aFlow.y;
    float taper = pow(sin(3.14159265 * t), 0.7) * (0.45 + 0.55 * t);
    view.xyz += across * aFlow.x * uWidth * taper * (0.65 + 0.35 * aFlow.z);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  varying vec3 vFlow;
  void main() {
    float t = vFlow.y;
    float head = fract(uTime * (0.16 + 0.05 * vFlow.z) + uPhase + vFlow.z);
    float behind = fract(head - t);
    float comet = exp(-behind * 3.2);
    float edge = pow(max(0.0, 1.0 - abs(vFlow.x)), 1.6);
    float ends = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.82, t);
    float alpha = (0.1 + comet) * edge * ends * uOpacity;
    vec3 color = mix(uColor, vec3(1.0), edge * comet * 0.35);
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Soft ribbon wisps follow each curve; placement always comes from Project. */
function wispGeometry(curve: THREE.Curve<THREE.Vector3>) {
  const vertices = STRANDS * (SEGMENTS + 1) * 2;
  const position = new Float32Array(vertices * 3);
  const tangent = new Float32Array(vertices * 3);
  const flow = new Float32Array(vertices * 3);
  const index: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const spread = Math.min(0.22, curve.getLength() * 0.12);
  let v = 0;
  for (let strand = 0; strand < STRANDS; strand++) {
    const k = (strand - (STRANDS - 1) / 2) / ((STRANDS - 1) / 2);
    const seed = (strand * 0.37) % 1;
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS;
      curve.getPoint(t, point);
      curve.getTangent(t, direction).normalize();
      lateral.crossVectors(direction, up);
      if (lateral.lengthSq() < 1e-6) lateral.set(1, 0, 0);
      lateral.normalize();
      normal.crossVectors(lateral, direction);
      const fan = Math.pow(t, 1.2);
      point
        .addScaledVector(lateral, k * spread * fan)
        .addScaledVector(normal, Math.sin(strand * 1.7) * 0.4 * spread * fan);
      for (const side of [-1, 1]) {
        point.toArray(position, v * 3);
        direction.toArray(tangent, v * 3);
        flow.set([side, t, seed], v * 3);
        v++;
      }
      if (s < SEGMENTS) {
        const a = v - 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangent, 3));
  geometry.setAttribute("aFlow", new THREE.BufferAttribute(flow, 3));
  geometry.setIndex(index);
  return geometry;
}

export function ComfortFlows({
  project,
  floorId,
  mode,
  roomId,
  includeDucted,
}: {
  project: Project;
  floorId: string;
  mode: ComfortMode;
  roomId?: string;
  includeDucted?: boolean;
}) {
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paths = useMemo(
    () =>
      comfortFields(project, floorId, mode, roomId, includeDucted).map(
        (field, i) => {
          const returned = field.kind === "return";
          return {
            field,
            geometry: wispGeometry(comfortFlowCurve(field)),
            material: new THREE.ShaderMaterial({
              vertexShader,
              fragmentShader,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
              uniforms: {
                uColor: {
                  value: new THREE.Color(
                    returned
                      ? "#6f9aa3"
                      : mode === "heat"
                        ? "#f0883a"
                        : "#2f9fe0",
                  ),
                },
                uTime: { value: 0 },
                uPhase: { value: (i * 0.13) % 1 },
                uOpacity: { value: returned ? 0.6 : 0.95 },
                uWidth: { value: returned ? 0.045 : 0.065 },
              },
            }),
          };
        },
      ),
    [project, floorId, mode, roomId, includeDucted],
  );
  useEffect(() => {
    gl.domElement.setAttribute("data-comfort-mode", mode);
    gl.domElement.setAttribute("data-comfort-streams", String(paths.length));
    return () => {
      gl.domElement.removeAttribute("data-comfort-mode");
      gl.domElement.removeAttribute("data-comfort-streams");
    };
  }, [gl, mode, paths]);
  useEffect(
    () => () =>
      paths.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      }),
    [paths],
  );
  useFrame(({ clock, invalidate }) => {
    const time = reduced ? 3.2 : clock.elapsedTime;
    for (const mesh of group.current?.children ?? [])
      (
        (mesh as THREE.Mesh).material as THREE.ShaderMaterial
      ).uniforms.uTime.value = time;
    if (!reduced && paths.length > 0) invalidate();
  });
  return (
    <group ref={group}>
      {paths.map(({ field, geometry, material }, i) => (
        <mesh
          key={`${field.deviceId}:${i}`}
          geometry={geometry}
          material={material}
          frustumCulled={false}
          renderOrder={5}
        />
      ))}
    </group>
  );
}
