"use client";

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Project, Selection } from "@/schemas/project";
import {
  fanCoilPanelDimensions,
  fanCoilDefaultPanelType,
  fanCoilProductAtVersion,
  isConcealedFanCoil,
  isDuctedFanCoil,
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
const recessedPanel = new THREE.MeshStandardMaterial({
  color: "#f4f4f1",
  roughness: 0.34,
  metalness: 0.08,
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

export function createFanCoilGrilleBars({
  faceW,
  faceH,
  faceD,
  ceiling,
  finCount,
  returnHeight,
  returnY,
  grilleZ,
  material,
  longitudinal = false,
}: {
  faceW: number;
  faceH: number;
  faceD: number;
  ceiling: boolean;
  finCount: number;
  returnHeight: number;
  returnY: number;
  grilleZ: number;
  material: THREE.Material;
  longitudinal?: boolean;
}) {
  const result = new THREE.InstancedMesh(
    box,
    material,
    finCount + (ceiling ? 3 : longitudinal ? 6 : 18),
  );
  result.castShadow = true;
  const transform = new THREE.Object3D();
  let index = 0;
  const addBar = (
    position: [number, number, number],
    scale: [number, number, number],
  ) => {
    transform.position.set(...position);
    transform.scale.set(...scale);
    transform.rotation.set(0, 0, 0);
    transform.updateMatrix();
    result.setMatrixAt(index++, transform.matrix);
  };
  for (let i = 0; i < finCount; i++)
    addBar(
      [
        0,
        returnY - returnHeight / 2 + (returnHeight * (i + 0.5)) / finCount,
        grilleZ,
      ],
      [faceW * 0.86, Math.min(0.004, (returnHeight / finCount) * 0.3), 0.002],
    );
  if (ceiling)
    for (let i = 0; i < 3; i++)
      addBar(
        [0, faceH * (0.292 + i * 0.034), grilleZ],
        [faceW * 0.86, faceH * 0.012, 0.003],
      );
  else if (longitudinal)
    for (let i = 0; i < 6; i++)
      addBar(
        [0, faceH / 2 + 0.0003, faceD * (-0.26 + i * 0.104)],
        [faceW * 0.86, 0.002, faceD * 0.035],
      );
  else
    for (let i = 0; i < 18; i++)
      addBar(
        [faceW * (-0.41 + (0.82 * i) / 17), faceH / 2 + 0.0003, 0],
        [0.004, 0.002, faceD * 0.63],
      );
  result.instanceMatrix.needsUpdate = true;
  result.computeBoundingSphere();
  return result;
}

/** Body and grilles are schematic; AirLeaf cover panels use official dimensions. */
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
  const concealed = isConcealedFanCoil(product) && !isDuctedFanCoil(product);
  const aermec = product?.manufacturer === "Aermec" && !concealed;
  const innova = product?.manufacturer === "Innova";
  const shell = concealed ? concealedShell : coating;
  const panel = product
    ? fanCoilPanelDimensions(
        product,
        unit.panelType ?? fanCoilDefaultPanelType(product, unit.mounting),
      )
    : null;
  const hasPanel = panel !== null;
  const faceW = (panel?.widthMm ?? unit.widthMm) / 1000;
  const faceH = (panel?.heightMm ?? unit.heightMm) / 1000;
  const faceD = (panel?.depthMm ?? unit.depthMm) / 1000;
  const body = useMemo(
    () =>
      new RoundedBoxGeometry(
        w,
        h,
        d,
        3,
        concealed
          ? 0.003
          : Math.min(aermec ? 0.055 : innova ? 0.006 : 0.018, h / 8, d / 4),
      ),
    [w, h, d, concealed, aermec, innova],
  );
  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(faceW, faceH, faceD);
    const result = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return result;
  }, [faceW, faceH, faceD]);
  const cover = useMemo(() => {
    if (!hasPanel) return null;
    return new RoundedBoxGeometry(faceW, faceH, faceD, 3, 0.004);
  }, [hasPanel, faceW, faceH, faceD]);
  useEffect(
    () => () => {
      body.dispose();
      edges.dispose();
      cover?.dispose();
    },
    [body, edges, cover],
  );
  const grilleZ = d / 2 + 0.0003;
  const returnHeight = faceH * (ceiling ? 0.24 : aermec ? 0.08 : 0.19);
  const returnY = -faceH * (ceiling ? 0.29 : aermec ? 0.42 : 0.31);
  const finCount = Math.min(12, Math.max(4, Math.round(returnHeight / 0.017)));
  const bars = useMemo(
    () =>
      createFanCoilGrilleBars({
        faceW,
        faceH,
        faceD,
        ceiling,
        finCount,
        returnHeight,
        returnY,
        grilleZ,
        material: shell,
        longitudinal: aermec,
      }),
    [
      ceiling,
      faceD,
      faceH,
      faceW,
      finCount,
      grilleZ,
      returnHeight,
      returnY,
      shell,
      aermec,
    ],
  );
  useEffect(
    () => () => {
      bars.dispose();
    },
    [bars],
  );
  return (
    <>
      <mesh geometry={body} material={shell} castShadow receiveShadow />
      {cover && (
        <mesh
          geometry={cover}
          material={recessedPanel}
          position={[0, 0, d / 2 - faceD / 2]}
          castShadow
          receiveShadow
        />
      )}
      <mesh
        geometry={plane}
        material={recess}
        position={[0, returnY, grilleZ]}
        scale={[faceW * 0.86, returnHeight, 1]}
      />
      <primitive object={bars} />
      {ceiling ? (
        <>
          <mesh
            geometry={plane}
            material={recess}
            position={[0, faceH * 0.33, grilleZ]}
            scale={[faceW * 0.86, faceH * 0.11, 1]}
          />
        </>
      ) : (
        <>
          <mesh
            geometry={plane}
            material={recess}
            position={[0, faceH / 2 + 0.0003, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[faceW * 0.86, faceD * 0.63, 1]}
          />
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
  hideDuctedMachines = false,
}: {
  project: Project;
  activeFloorId: string;
  selection: Selection[];
  onSelect: (selection: Selection) => void;
  isolatedRoomId?: string;
  hideDuctedMachines?: boolean;
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
        .filter(
          (unit) =>
            !hideDuctedMachines ||
            !isDuctedFanCoil(
              fanCoilProductAtVersion(unit.productId, unit.catalogVersion),
            ),
        )
        .map((unit) => (
          <group
            key={unit.id}
            name={`Ventilconvettore ${unit.productId}`}
            userData={{ sketchupGroup: true }}
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
