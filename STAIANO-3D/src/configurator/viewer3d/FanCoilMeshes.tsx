"use client";

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Project, Selection } from "@/schemas/project";
import {
  fanCoilProductAtVersion,
  isConcealedFanCoil,
} from "@/domain/catalogs/fan-coils";
import type { FanCoilPlacement } from "@/domain/fan-coils/placement";

const box = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1);
const coating = new THREE.MeshStandardMaterial({
  color: "#f4f3ef",
  roughness: 0.3,
  metalness: 0.15,
});
const concealedShell = new THREE.MeshStandardMaterial({
  color: "#bec9cc",
  roughness: 0.4,
  metalness: 0.65,
});
const recess = new THREE.MeshStandardMaterial({
  color: "#25343b",
  roughness: 0.8,
  side: THREE.DoubleSide,
});
const outline = new THREE.LineBasicMaterial({
  color: "#00a9b8",
  transparent: true,
  opacity: 0.85,
});

/** Metric schematic enclosure; grille detail does not claim an official OEM mesh. */
function FanCoilBody({
  unit,
  selected,
}: {
  unit: FanCoilPlacement;
  selected: boolean;
}) {
  const w = unit.widthMm / 1000,
    h = unit.heightMm / 1000,
    d = unit.depthMm / 1000;
  const ceiling = unit.mounting === "ceiling";
  const product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  const concealed = isConcealedFanCoil(product);
  const shell = concealed ? concealedShell : coating;
  const body = useMemo(
    () =>
      new RoundedBoxGeometry(
        w,
        h,
        d,
        3,
        concealed ? 0.003 : Math.min(0.018, h / 14, d / 6),
      ),
    [w, h, d, concealed],
  );
  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const result = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return result;
  }, [w, h, d]);
  useEffect(
    () => () => {
      body.dispose();
      edges.dispose();
    },
    [body, edges],
  );
  const grilleZ = d / 2 + 0.0003;
  const returnHeight = h * (ceiling ? 0.24 : 0.19);
  const returnY = -h * (ceiling ? 0.29 : 0.31);
  const finCount = Math.min(12, Math.max(4, Math.round(returnHeight / 0.017)));
  return (
    <>
      <mesh geometry={body} material={shell} castShadow receiveShadow />
      <mesh
        geometry={plane}
        material={recess}
        position={[0, returnY, grilleZ]}
        scale={[w * 0.86, returnHeight, 1]}
      />
      {Array.from({ length: finCount }, (_, i) => (
        <mesh
          key={`return-${i}`}
          geometry={box}
          material={shell}
          castShadow
          position={[
            0,
            returnY - returnHeight / 2 + (returnHeight * (i + 0.5)) / finCount,
            grilleZ,
          ]}
          scale={[
            w * 0.86,
            Math.min(0.004, (returnHeight / finCount) * 0.3),
            0.002,
          ]}
        />
      ))}
      {ceiling ? (
        <>
          <mesh
            geometry={plane}
            material={recess}
            position={[0, h * 0.33, grilleZ]}
            scale={[w * 0.86, h * 0.11, 1]}
          />
          {[0, 1, 2].map((i) => (
            <mesh
              key={`discharge-${i}`}
              geometry={box}
              material={shell}
              position={[0, h * (0.292 + i * 0.034), grilleZ]}
              scale={[w * 0.86, h * 0.012, 0.003]}
            />
          ))}
        </>
      ) : (
        <>
          <mesh
            geometry={plane}
            material={recess}
            position={[0, h / 2 + 0.0003, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[w * 0.86, d * 0.63, 1]}
          />
          {Array.from({ length: 18 }, (_, i) => (
            <mesh
              key={`discharge-${i}`}
              geometry={box}
              material={shell}
              castShadow
              position={[w * (-0.41 + (0.82 * i) / 17), h / 2 + 0.0003, 0]}
              scale={[0.004, 0.002, d * 0.63]}
            />
          ))}
        </>
      )}
      {selected && (
        <lineSegments geometry={edges} material={outline} renderOrder={3} />
      )}
    </>
  );
}

export function FanCoilMeshes({
  project,
  activeFloorId,
  selection,
  onSelect,
  isolatedRoomId,
}: {
  project: Project;
  activeFloorId: string;
  selection: Selection[];
  onSelect: (selection: Selection) => void;
  isolatedRoomId?: string;
}) {
  const choose = (id: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect({ kind: "device", id });
  };
  return (
    <group dispose={null}>
      {(project.fanCoils ?? [])
        .filter(
          (unit) =>
            unit.floorId === activeFloorId &&
            (!isolatedRoomId || unit.roomId === isolatedRoomId),
        )
        .filter((unit) =>
          [unit.widthMm, unit.heightMm, unit.depthMm, unit.elevationM].every(
            (value) => Number.isFinite(value) && value > 0,
          ),
        )
        .map((unit) => (
          <group
            key={unit.id}
            position={[
              unit.position.x,
              unit.elevationM +
                (unit.mounting === "ceiling" ? unit.depthMm / 2000 : 0),
              unit.position.y,
            ]}
            rotation={
              unit.mounting === "ceiling"
                ? [Math.PI / 2, 0, unit.rotation]
                : [0, -unit.rotation, 0]
            }
            onClick={choose(unit.id)}
          >
            <FanCoilBody
              unit={unit}
              selected={selection.some(
                (s) => s.kind === "device" && s.id === unit.id,
              )}
            />
          </group>
        ))}
    </group>
  );
}
