"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { comfortFields, type ComfortMode } from "./comfort-fields";

/** One GPU instance batch animates all arrows; placement always comes from Project. */
export function ComfortFlows({
  project,
  floorId,
  mode,
  roomId,
}: {
  project: Project;
  floorId: string;
  mode: ComfortMode;
  roomId?: string;
}) {
  const arrows = useRef<THREE.InstancedMesh>(null);
  const { gl } = useThree();
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paths = useMemo(
    () =>
      comfortFields(project, floorId, mode, roomId).map((field) => ({
        field,
        curve: new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(...field.start),
          new THREE.Vector3(...field.control),
          new THREE.Vector3(...field.end),
        ),
      })),
    [project, floorId, mode, roomId],
  );
  const transform = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const color = mode === "heat" ? "#e8a465" : "#64c8e5";
  useEffect(() => {
    gl.domElement.setAttribute("data-comfort-mode", mode);
    gl.domElement.setAttribute("data-comfort-streams", String(paths.length));
    return () => {
      gl.domElement.removeAttribute("data-comfort-mode");
      gl.domElement.removeAttribute("data-comfort-streams");
    };
  }, [gl, mode, paths.length]);
  useFrame(({ clock, invalidate }) => {
    if (!arrows.current) return;
    for (let i = 0; i < paths.length; i++)
      for (let j = 0; j < 5; j++) {
        const t = reduced
          ? (j + 0.5) / 5
          : (clock.elapsedTime * 0.22 + j / 5 + i * 0.13) % 1;
        transform.position.copy(paths[i].curve.getPoint(t));
        transform.quaternion.setFromUnitVectors(
          up,
          paths[i].curve.getTangent(t).normalize(),
        );
        transform.scale.setScalar(paths[i].field.kind === "return" ? 0.72 : 1);
        transform.updateMatrix();
        arrows.current.setMatrixAt(i * 5 + j, transform.matrix);
      }
    arrows.current.instanceMatrix.needsUpdate = true;
    if (!reduced) invalidate();
  });
  return (
    <group>
      {paths.map(({ field, curve }, i) => (
        <Line
          key={`${field.deviceId}:${i}`}
          points={curve.getPoints(20)}
          color={field.kind === "return" ? "#81a9af" : color}
          lineWidth={2.5}
          transparent
          opacity={0.3}
        />
      ))}
      {paths.length > 0 && (
        <instancedMesh
          ref={arrows}
          args={[undefined, undefined, paths.length * 5]}
          frustumCulled={false}
        >
          <coneGeometry args={[0.035, 0.11, 10]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.72}
            depthWrite={false}
          />
        </instancedMesh>
      )}
    </group>
  );
}
