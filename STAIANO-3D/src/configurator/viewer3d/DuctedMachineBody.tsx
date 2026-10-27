"use client";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import {
  hvacProductAtVersion,
  hvacDischargeConnection,
} from "@/domain/catalogs/hvac";
import type { DischargeConnection } from "@/domain/catalogs/hvac-schema";
import { Parts } from "./Parts";
import type { DetailPart } from "./device-detail";
import { Suspense } from "react";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import GreeDuctedBody from "./GreeDuctedBody";

const box = new THREE.BoxGeometry(1, 1, 1);
const metal = new THREE.MeshStandardMaterial({
  color: "#bac7ca",
  roughness: 0.35,
  metalness: 0.6,
});
const selectedMetal = new THREE.MeshStandardMaterial({
  color: "#73b5ce",
  roughness: 0.35,
  metalness: 0.5,
});
const recess = new THREE.MeshStandardMaterial({
  color: "#23373e",
  roughness: 0.75,
});
const ribs = new THREE.MeshStandardMaterial({
  color: "#91a4ab",
  roughness: 0.4,
  metalness: 0.7,
});

export function ductedOpening(
  widthMm: number,
  heightMm: number,
  connection: DischargeConnection | null,
): [number, number] {
  // A flange's mounting span is not its clear opening; an undocumented opening stays representative.
  return [
    Math.min(widthMm * 0.94, connection?.clearOpeningWidthMm ?? widthMm * 0.8) /
      1000,
    Math.min(
      heightMm * 0.94,
      connection?.clearOpeningHeightMm ?? heightMm * 0.6,
    ) / 1000,
  ];
}

/** Reconstructed sheet-metal casing, discharge frame, rear filter and stiffening ribs. */
export function DuctedMachineBody({
  item,
  selected,
  connection: suppliedConnection,
}: {
  item: Pick<
    Project["hvacSystems"][number]["indoorUnits"][number],
    "widthMm" | "heightMm" | "depthMm" | "productId" | "catalogVersion"
  >;
  selected: boolean;
  connection?: DischargeConnection | null;
}) {
  const fallback = <DuctedMachineSketch item={item} selected={selected} connection={suppliedConnection} />;
  return <ModelAssetBoundary fallback={fallback}>
    <Suspense fallback={fallback}>
      <GreeDuctedBody width={item.widthMm / 1000} height={item.heightMm / 1000} depth={item.depthMm / 1000} selected={selected} url={item.productId.startsWith("aermec-fcz") ? "/models/hvac/aermec-fcz-p-po-realistic.glb" : undefined} />
    </Suspense>
  </ModelAssetBoundary>;
}

function DuctedMachineSketch({ item, selected, connection: suppliedConnection }: {
  item: Pick<Project["hvacSystems"][number]["indoorUnits"][number], "widthMm" | "heightMm" | "depthMm" | "productId" | "catalogVersion">;
  selected: boolean;
  connection?: DischargeConnection | null;
}) {
  const w = item.widthMm / 1000,
    h = item.heightMm / 1000,
    d = item.depthMm / 1000;
  const connection =
    suppliedConnection === undefined
      ? hvacDischargeConnection(
          hvacProductAtVersion(item.productId, item.catalogVersion),
        )
      : suppliedConnection;
  const [ow, oh] = ductedOpening(item.widthMm, item.heightMm, connection);
  const trim = Math.min(0.008, h * 0.03);
  const flange: DetailPart[] = [
    {
      position: [0, oh / 2, d / 2 + 0.001],
      scale: [ow + trim * 2, trim, 0.004],
    },
    {
      position: [0, -oh / 2, d / 2 + 0.001],
      scale: [ow + trim * 2, trim, 0.004],
    },
    { position: [-ow / 2, 0, d / 2 + 0.001], scale: [trim, oh, 0.004] },
    { position: [ow / 2, 0, d / 2 + 0.001], scale: [trim, oh, 0.004] },
  ];
  const details: DetailPart[] = [
    ...Array.from({ length: 6 }, (_, i): DetailPart => ({
      position: [0, h / 2 + 0.0005, ((i + 0.5) / 6 - 0.5) * d * 0.85],
      scale: [w * 0.9, 0.001, 0.006],
    })),
    ...Array.from({ length: 14 }, (_, i): DetailPart => ({
      position: [((i + 0.5) / 14 - 0.5) * w * 0.8, 0, -d / 2 - 0.001],
      scale: [0.004, h * 0.65, 0.001],
    })),
  ];
  return (
    <group dispose={null}>
      <mesh
        geometry={box}
        material={selected ? selectedMetal : metal}
        scale={[w, h, d]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={box}
        material={recess}
        position={[0, 0, d / 2 + 0.0005]}
        scale={[ow, oh, 0.001]}
      />
      <mesh
        geometry={box}
        material={recess}
        position={[0, 0, -d / 2 - 0.0005]}
        scale={[w * 0.82, h * 0.68, 0.001]}
      />
      <Parts parts={[...flange, ...details]} geometry={box} material={ribs} />
      <mesh
        geometry={box}
        material={ribs}
        position={[w / 2 + 0.0005, 0, -d * 0.12]}
        scale={[0.001, h * 0.72, d * 0.6]}
      />
    </group>
  );
}
