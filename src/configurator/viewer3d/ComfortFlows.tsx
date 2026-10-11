"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { comfortFields, type ComfortMode } from "./comfort-fields";
import { comfortFlowCurve } from "./comfort-curve";

/** One GPU instance batch animates the streaks; placement always comes from Project. */
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
  const streaks = useRef<THREE.InstancedMesh>(null);
  const { gl } = useThree();
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paths = useMemo(
    () =>
      comfortFields(project, floorId, mode, roomId).map((field) => ({
        field,
        color: new THREE.Color(
          field.kind === "return"
            ? "#81a9af"
            : mode === "heat"
              ? "#e89a56"
              : "#42b9dd",
        ),
        curve: comfortFlowCurve(field),
      })),
    [project, floorId, mode, roomId],
  );
  const transform = useMemo(() => new THREE.Object3D(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tangent = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    if (streaks.current) {
      paths.forEach(({ color }, i) => {
        for (let j = 0; j < 5; j++)
          streaks.current!.setColorAt(i * 5 + j, color);
      });
      if (streaks.current.instanceColor)
        streaks.current.instanceColor.needsUpdate = true;
    }
    gl.domElement.setAttribute("data-comfort-mode", mode);
    gl.domElement.setAttribute("data-comfort-streams", String(paths.length));
    return () => {
      gl.domElement.removeAttribute("data-comfort-mode");
      gl.domElement.removeAttribute("data-comfort-streams");
    };
  }, [gl, mode, paths]);
  useFrame(({ clock, invalidate }) => {
    if (!streaks.current) return;
    for (let i = 0; i < paths.length; i++)
      for (let j = 0; j < 5; j++) {
        const t = reduced
          ? (j + 0.5) / 5
          : (clock.elapsedTime * 0.16 + j / 5 + i * 0.13) % 1;
        paths[i].curve.getPoint(t, transform.position);
        transform.quaternion.setFromUnitVectors(
          up,
          paths[i].curve.getTangent(t, tangent).normalize(),
        );
        const fade = Math.sin(Math.PI * t);
        const size = paths[i].field.kind === "return" ? 0.72 : 1;
        transform.scale.set(
          0.022 * fade * size,
          0.13 * fade * size,
          0.022 * fade * size,
        );
        transform.updateMatrix();
        streaks.current.setMatrixAt(i * 5 + j, transform.matrix);
      }
    streaks.current.instanceMatrix.needsUpdate = true;
    if (!reduced && paths.length > 0) invalidate();
  });
  return (
    <group>
      {paths.map(({ field, curve, color }, i) => (
        <Line
          key={`${field.deviceId}:${i}`}
          points={curve.getPoints(96)}
          color={color}
          lineWidth={1.5}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      ))}
      {paths.length > 0 && (
        <instancedMesh
          ref={streaks}
          args={[undefined, undefined, paths.length * 5]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 10, 6]} />
          <meshBasicMaterial transparent opacity={0.68} depthWrite={false} />
        </instancedMesh>
      )}
    </group>
  );
}
