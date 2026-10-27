"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Duct, Project } from "@/schemas/project";
import {
  createDuctFromEndpoints,
  type RoutePoint,
} from "@/domain/ducted/routes";
import { FlexibleDuct } from "./FlexibleDuct";
import { useProjectStore } from "@/stores/project-store";
import { flexibleDuctCurve } from "@/domain/ducted/flexible-curve";
import { ductScenePaths, findDuctCollisions } from "@/domain/ducted/collisions";

export function FlowParticles({
  points,
  animated,
  color,
  diameterMm,
  flexibleProductId,
  count = 6,
  radiusM = 0.024,
  speedMps,
}: {
  points: RoutePoint[];
  animated: boolean;
  color: string;
  diameterMm?: number;
  flexibleProductId?: string;
  /** Numero di particelle; più fitte su tubi lunghi per far leggere il verso. */
  count?: number;
  radiusM?: number;
  /** Velocità costante in m/s; senza, una corsa completa ogni ~8 s. */
  speedMps?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const curve = useMemo(() => {
    if (diameterMm)
      return (
        flexibleDuctCurve(points, diameterMm, flexibleProductId)?.curve ??
        new THREE.CurvePath<THREE.Vector3>()
      );
    const curve = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1],
        end = points[i];
      if (
        Math.hypot(
          start.x - end.x,
          start.y - end.y,
          start.elevationM - end.elevationM,
        ) < 1e-6
      )
        continue;
      curve.add(
        new THREE.LineCurve3(
          new THREE.Vector3(start.x, start.elevationM, start.y),
          new THREE.Vector3(end.x, end.elevationM, end.y),
        ),
      );
    }
    return curve;
  }, [points, diameterMm, flexibleProductId]);
  const transform = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock, invalidate }) => {
    if (!animated || !ref.current || curve.getLength() < 0.001) return;
    const length = curve.getLength();
    const rate = speedMps ? speedMps / length : 0.12;
    for (let i = 0; i < count; i++) {
      const p = curve.getPointAt((clock.elapsedTime * rate + i / count) % 1);
      transform.position.copy(p);
      transform.updateMatrix();
      ref.current.setMatrixAt(i, transform.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    invalidate();
  });
  return animated ? (
    <instancedMesh
      ref={ref}
      key={count}
      args={[undefined, undefined, count]}
      frustumCulled={false}
    >
      <sphereGeometry args={[radiusM, 10, 8]} />
      <meshBasicMaterial color={color} />
    </instancedMesh>
  ) : null;
}

function DuctSegment({
  start,
  end,
  duct,
  color,
}: {
  start: RoutePoint;
  end: RoutePoint;
  duct: Pick<Duct, "shape" | "diameterMm" | "widthMm" | "heightMm">;
  color: string;
}) {
  const vector = new THREE.Vector3(
    end.x - start.x,
    end.elevationM - start.elevationM,
    end.y - start.y,
  );
  const length = vector.length();
  if (length < 1e-6) return null;
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    vector.normalize(),
  );
  return (
    <mesh
      position={[
        (start.x + end.x) / 2,
        (start.elevationM + end.elevationM) / 2,
        (start.y + end.y) / 2,
      ]}
      quaternion={rotation}
    >
      {duct.shape === "circle" ? (
        <cylinderGeometry
          args={[
            (duct.diameterMm ?? 0) / 2000,
            (duct.diameterMm ?? 0) / 2000,
            length,
            18,
            1,
            true,
          ]}
        />
      ) : (
        <boxGeometry
          args={[
            (duct.widthMm ?? 0) / 1000,
            length,
            (duct.heightMm ?? 0) / 1000,
          ]}
        />
      )}
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.38}
        metalness={0.45}
        roughness={0.3}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// Scheda e foto Ecoclima ETF10: tubo flessibile nero (grigio scuro per restare leggibile sulla scena).
const FLEX_DUCT_COLOR = "#33373a";

export function DuctMeshes({
  project,
  activeFloorId,
  animated = false,
  flowMode = "cool",
  onAddWaypoint,
  editable = true,
}: {
  project: Project;
  activeFloorId: string;
  animated?: boolean;
  flowMode?: "cool" | "heat";
  editable?: boolean;
  /** Doppio clic sul tubo: inserisce una curva nel punto indicato. */
  onAddWaypoint?: (ductId: string, point: RoutePoint) => void;
}) {
  const { gl } = useThree();
  const selectedId = useProjectStore((state) => state.selection[0]?.id);
  const paths = useMemo(
    () => ductScenePaths(project, activeFloorId),
    [project, activeFloorId],
  );
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const collisions = useMemo(
    () => findDuctCollisions(project, paths),
    [project, paths],
  );
  const connections = paths.filter((path) => !path.duct);
  const ducts = paths.flatMap((path) =>
    path.duct ? [{ duct: path.duct, points: path.points }] : [],
  );
  const systems = project.hvacSystems.filter((s) => s.type === "ducted");
  useEffect(() => {
    gl.domElement.setAttribute(
      "data-air-connections",
      String(connections.length),
    );
    gl.domElement.setAttribute("data-duct-count", String(ducts.length));
    gl.domElement.setAttribute(
      "data-duct-collision-count",
      String(collisions.size),
    );
    return () => {
      gl.domElement.removeAttribute("data-air-connections");
      gl.domElement.removeAttribute("data-duct-count");
      gl.domElement.removeAttribute("data-duct-collision-count");
    };
  }, [gl, connections.length, ducts.length, collisions.size]);
  return (
    <group>
      {connections.map(
        ({ id, terminalId, portIndex, diameterMm, points, fallbackPoint }) => (
          <group
            key={id}
            onClick={(event) => {
              if (!editable) return;
              event.stopPropagation();
              const terminal = project.airTerminals.find(
                (t) => t.id === terminalId,
              );
              if (!terminal?.systemId) return;
              let ductId: string | undefined;
              useProjectStore.getState().commit((current) => {
                const result = createDuctFromEndpoints(
                  current,
                  terminal.id,
                  terminal.systemId!,
                );
                ductId = result.ductIds[portIndex ?? 0];
                return result.project;
              });
              if (ductId && !useProjectStore.getState().error)
                useProjectStore
                  .getState()
                  .select({ kind: "device", id: ductId });
            }}
          >
            <FlexibleDuct
              points={points}
              diameterMm={diameterMm}
              color={collisions.has(id) ? "#dc2626" : FLEX_DUCT_COLOR}
              collision={collisions.get(id)}
              fallbackPoint={fallbackPoint}
            />
            <FlowParticles
              points={points}
              diameterMm={diameterMm}
              animated={animated && !reducedMotion}
              color={flowMode === "heat" ? "#ffe1b6" : "#d5faff"}
            />
          </group>
        ),
      )}
      {ducts.map(({ duct, points }) => {
        const terminal = project.airTerminals.find(
          (t) => t.id === duct.terminalId,
        );
        const color =
          systems.findIndex((s) => s.id === duct.systemId) % 2 === 0
            ? "#20a8cd"
            : "#dcad65";
        return (
          <group
            key={duct.id}
            onClick={(e) => {
              if (!editable) return;
              e.stopPropagation();
              useProjectStore
                .getState()
                .select({ kind: "device", id: duct.id });
            }}
            onDoubleClick={(e) => {
              if (!editable) return;
              e.stopPropagation();
              useProjectStore
                .getState()
                .select({ kind: "device", id: duct.id });
              onAddWaypoint?.(duct.id, {
                x: e.point.x,
                y: e.point.z,
                elevationM: e.point.y,
              });
            }}
          >
            {duct.kind === "flexible" ? (
              <FlexibleDuct
                points={points}
                diameterMm={duct.diameterMm ?? 160}
                flexibleProductId={duct.flexibleProductId}
                color={
                  collisions.has(duct.id)
                    ? "#dc2626"
                    : selectedId === duct.id
                      ? "#50c7df"
                      : FLEX_DUCT_COLOR
                }
                collision={collisions.get(duct.id)}
                fallbackPoint={
                  terminal
                    ? {
                        ...terminal.position,
                        elevationM: terminal.elevationM ?? 2,
                      }
                    : undefined
                }
              />
            ) : (
              points
                .slice(1)
                .map((end, i) => (
                  <DuctSegment
                    key={i}
                    start={points[i]}
                    end={end}
                    duct={duct}
                    color={color}
                  />
                ))
            )}
            {duct.kind !== "flexible" && points.length > 1 && (
              <Line
                points={points.map(
                  (p) => [p.x, p.elevationM, p.y] as [number, number, number],
                )}
                color={color}
                lineWidth={1.5}
                transparent
                opacity={0.8}
              />
            )}
            <FlowParticles
              points={points}
              diameterMm={
                duct.kind === "flexible" ? (duct.diameterMm ?? 160) : undefined
              }
              flexibleProductId={duct.flexibleProductId}
              animated={animated && !reducedMotion}
              color={flowMode === "heat" ? "#ffe1b6" : "#d5faff"}
            />
          </group>
        );
      })}
    </group>
  );
}
