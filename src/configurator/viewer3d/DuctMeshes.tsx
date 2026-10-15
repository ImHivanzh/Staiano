"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Duct, Project } from "@/schemas/project";
import {
  airConnectionRoutes,
  ductRoute,
  type RoutePoint,
} from "@/domain/ducted/routes";
import { placedPlenumGeometry } from "@/domain/ducted/placement";

function FlowParticles({
  points,
  animated,
  color,
}: {
  points: RoutePoint[];
  animated: boolean;
  color: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const curve = useMemo(() => {
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
  }, [points]);
  const transform = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock, invalidate }) => {
    if (!animated || !ref.current || curve.getLength() < 0.001) return;
    for (let i = 0; i < 6; i++) {
      const p = curve.getPointAt((clock.elapsedTime * 0.12 + i / 6) % 1);
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
      args={[undefined, undefined, 6]}
      frustumCulled={false}
    >
      <sphereGeometry args={[0.024, 10, 8]} />
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

export function DuctMeshes({
  project,
  activeFloorId,
  animated = false,
  flowMode = "cool",
}: {
  project: Project;
  activeFloorId: string;
  animated?: boolean;
  flowMode?: "cool" | "heat";
}) {
  const { gl } = useThree();
  const connections = useMemo(
    () => airConnectionRoutes(project, activeFloorId),
    [project, activeFloorId],
  );
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ducts = useMemo(() => {
    const geometries = new Map(
      project.plenums
        .filter((pl) => pl.floorId === activeFloorId)
        .map((pl) => [pl.id, placedPlenumGeometry(project, pl)]),
    );
    return (project.ducts ?? [])
      .filter((d) => geometries.has(d.plenumId))
      .map((duct) => ({
        duct,
        points: ductRoute(project, duct, geometries.get(duct.plenumId)),
      }));
  }, [project, activeFloorId]);
  const systems = project.hvacSystems.filter((s) => s.type === "ducted");
  useEffect(() => {
    gl.domElement.setAttribute(
      "data-air-connections",
      String(connections.length),
    );
    gl.domElement.setAttribute("data-duct-count", String(ducts.length));
    return () => {
      gl.domElement.removeAttribute("data-air-connections");
      gl.domElement.removeAttribute("data-duct-count");
    };
  }, [gl, connections.length, ducts.length]);
  return (
    <group>
      {/* shortcut: collegamenti senza canale con spessore illustrativo; usare dimensioni salvate dopo configurazione del canale. */}
      {connections.map(({ terminalId, points }) => (
        <group key={terminalId}>
          {points.slice(1).map((end, index) => (
            <DuctSegment
              key={index}
              start={points[index]}
              end={end}
              duct={{
                shape: "circle",
                diameterMm: 70,
                widthMm: null,
                heightMm: null,
              }}
              color="#65aebe"
            />
          ))}
          <FlowParticles
            points={points}
            animated={animated && !reducedMotion}
            color={flowMode === "heat" ? "#ffe1b6" : "#d5faff"}
          />
        </group>
      ))}
      {ducts.map(({ duct, points }) => {
        const color =
          systems.findIndex((s) => s.id === duct.systemId) % 2 === 0
            ? "#20a8cd"
            : "#dcad65";
        return (
          <group key={duct.id}>
            {points.slice(1).map((end, i) => (
              <DuctSegment
                key={i}
                start={points[i]}
                end={end}
                duct={duct}
                color={color}
              />
            ))}
            {points.length > 1 && (
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
              animated={animated && !reducedMotion}
              color={flowMode === "heat" ? "#ffe1b6" : "#d5faff"}
            />
          </group>
        );
      })}
    </group>
  );
}
