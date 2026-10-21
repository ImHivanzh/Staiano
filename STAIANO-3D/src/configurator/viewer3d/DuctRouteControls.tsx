"use client";
import { useEffect, useRef } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";

export function DuctRouteControls({
  project,
  id,
  index,
  onSelect,
  onPreview,
}: {
  project: Project;
  id: string;
  index: number | null;
  onSelect: (index: number | null) => void;
  onPreview: (p: Project | null) => void;
}) {
  const duct = project.ducts?.find((d) => d.id === id);
  const proxy = useRef(new THREE.Group());
  const dragging = useRef(false);
  const { commit, setError } = useProjectStore();
  const point =
    duct && index !== null && index >= 0 && index < duct.waypoints.length
      ? duct.waypoints[index]
      : undefined;
  useEffect(() => {
    if (point) proxy.current.position.set(point.x, point.elevationM, point.y);
  }, [point]);
  useEffect(() => () => onPreview(null), [onPreview]);
  if (!duct || duct.locked) return null;
  const apply = (p: Project): Project => ({
    ...p,
    ducts: p.ducts?.map((d) =>
      d.id === id && index !== null
        ? {
            ...d,
            routing: "manual",
            decisionOrigin: "manual",
            waypoints: d.waypoints.map((w, i) =>
              i === index
                ? {
                    x: proxy.current.position.x,
                    y: proxy.current.position.z,
                    elevationM: proxy.current.position.y,
                  }
                : w,
            ),
          }
        : d,
    ),
  });
  return (
    <group>
      {duct.waypoints.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, p.elevationM, p.y]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(i);
          }}
        >
          <sphereGeometry args={[i === index ? 0.075 : 0.055, 16, 12]} />
          <meshBasicMaterial
            color={i === index ? "#f9ad45" : "#1288a3"}
            depthTest={false}
          />
        </mesh>
      ))}
      {point && (
        <>
          <group ref={proxy} />
          <TransformControls
            object={proxy}
            mode="translate"
            space="world"
            size={0.7}
            onMouseDown={() => {
              dragging.current = true;
              onPreview(project);
            }}
            onObjectChange={() => {
              if (dragging.current) onPreview(apply(project));
            }}
            onMouseUp={() => {
              if (!dragging.current) return;
              dragging.current = false;
              if (proxy.current.position.y < 0 || proxy.current.position.y > 30)
                setError("Quota del punto compresa tra 0 e 30 m.");
              else commit(apply);
              onPreview(null);
            }}
          />
        </>
      )}
    </group>
  );
}
