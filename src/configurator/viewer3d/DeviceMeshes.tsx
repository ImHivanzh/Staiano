"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Project, Selection } from "@/schemas/project";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { radiatorDetail, type DetailPart } from "./device-detail";
import { resolveRadiatorFinish } from "@/domain/catalogs/radiator-finishes";
import { RadiatorHardware } from "./RadiatorHardware";

const box = new THREE.BoxGeometry(1, 1, 1);
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const plane = new THREE.PlaneGeometry(1, 1);
const circle = new THREE.CircleGeometry(1, 48);
const ring = new THREE.RingGeometry(0.76, 1, 48);
const enamel = new THREE.MeshStandardMaterial({
  color: "#f5f4ef",
  roughness: 0.26,
  metalness: 0.16,
});
const plastic = new THREE.MeshStandardMaterial({
  color: "#f5f5f1",
  roughness: 0.32,
  metalness: 0.02,
});
const aluminium = new THREE.MeshStandardMaterial({
  color: "#e8e9e7",
  roughness: 0.35,
  metalness: 0.44,
  side: THREE.DoubleSide,
});
const whiteFace = new THREE.MeshStandardMaterial({
  color: "#f4f3ee",
  roughness: 0.4,
  metalness: 0.08,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const faceBacking = new THREE.MeshStandardMaterial({
  color: "#f4f3ee",
  roughness: 0.4,
  side: THREE.DoubleSide,
});
const recess = new THREE.MeshStandardMaterial({
  color: "#242c31",
  roughness: 0.82,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const accent = new THREE.MeshStandardMaterial({
  color: "#627578",
  roughness: 0.38,
  metalness: 0.15,
});
const outlineMaterial = new THREE.LineBasicMaterial({
  color: "#00a9b8",
  transparent: true,
  opacity: 0.85,
});

/** Each repeated section/fin is a GPU instance, not a separate React mesh. */
function Parts({
  parts,
  geometry,
  material,
}: {
  parts: DetailPart[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    return () => {
      mesh?.dispose();
    };
  }, [parts.length]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    parts.forEach((part, index) => {
      transform.position.set(...part.position);
      transform.scale.set(...part.scale);
      transform.rotation.set(...(part.rotation ?? [0, 0, 0]));
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [parts]);
  if (!parts.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, parts.length]}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}

function SelectionOutline({
  dimensions,
}: {
  dimensions: [number, number, number];
}) {
  const edges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(...dimensions);
    const outline = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return outline;
  }, [dimensions]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <lineSegments geometry={edges} material={outlineMaterial} renderOrder={3} />
  );
}

function RadiatorMesh({
  item,
  selected,
}: {
  item: Project["radiators"][number];
  selected: boolean;
}) {
  const bodyFinish = resolveRadiatorFinish(
    item.manufacturer,
    item.family,
    "body",
    item.finishes?.bodyColorId,
  );
  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: bodyFinish?.colorHex ?? enamel.color,
        roughness: bodyFinish?.kind === "metal" ? 0.22 : 0.3,
        metalness: bodyFinish?.kind === "metal" ? 0.8 : 0.12,
      }),
    [bodyFinish],
  );
  useEffect(() => () => bodyMaterial.dispose(), [bodyMaterial]);
  const detail = useMemo(
    () =>
      radiatorDetail(
        item,
        radiatorProductAtVersion(item.productId, item.catalogVersion),
      ),
    [item],
  );
  return (
    <>
      <Parts parts={detail.tubes} geometry={cylinder} material={bodyMaterial} />
      <Parts parts={detail.caps} geometry={sphere} material={bodyMaterial} />
      <Parts
        parts={detail.headers}
        geometry={cylinder}
        material={bodyMaterial}
      />
      <Parts
        parts={detail.sections}
        geometry={rounded}
        material={bodyMaterial}
      />
      <Parts parts={detail.fins} geometry={box} material={bodyMaterial} />
      <Parts parts={detail.plugs} geometry={cylinder} material={aluminium} />
      <RadiatorHardware item={item} />
      {selected && (
        <SelectionOutline
          dimensions={[
            item.widthMm / 1000,
            item.heightMm / 1000,
            item.depthMm / 1000,
          ]}
        />
      )}
    </>
  );
}

function BrandMark({
  name,
  width,
  position,
}: {
  name: string;
  width: number;
  position: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#53656b";
      context.font = "600 54px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(name.toUpperCase(), 256, 48, 480);
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [name]);
  useEffect(() => () => texture.dispose(), [texture]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [texture],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={plane}
      material={material}
      position={position}
      scale={[width, (width * 96) / 512, 1]}
    ></mesh>
  );
}

function SplitMesh({
  item,
  manufacturer,
  selected,
}: {
  item: Project["hvacSystems"][number]["indoorUnits"][number];
  manufacturer: string;
  selected: boolean;
}) {
  const w = item.widthMm / 1000,
    h = item.heightMm / 1000,
    d = item.depthMm / 1000;
  const body = useMemo(
    () => new RoundedBoxGeometry(w, h, d, 3, Math.min(0.035, h / 7, d / 6)),
    [w, h, d],
  );
  useEffect(() => () => body.dispose(), [body]);
  const fins = useMemo<DetailPart[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        position: [(-0.42 + (i * 0.84) / 17) * w, -h * 0.32, d * 0.465],
        scale: [0.003, h * 0.16, 0.004],
      })),
    [w, h, d],
  );
  const topFins = useMemo<DetailPart[]>(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        position: [(-0.43 + (i * 0.86) / 24) * w, h * 0.487, -d * 0.08],
        scale: [0.005, 0.001, d * 0.55],
      })),
    [w, h, d],
  );
  return (
    <>
      <mesh geometry={body} material={plastic} castShadow receiveShadow />
      <mesh
        geometry={rounded}
        material={recess}
        position={[0, -h * 0.31, d * 0.475]}
        scale={[w * 0.89, h * 0.18, d * 0.025]}
      />
      <Parts parts={fins} geometry={box} material={aluminium} />
      <Parts parts={topFins} geometry={box} material={recess} />
      <mesh
        geometry={rounded}
        material={plastic}
        position={[0, -h * 0.405, d * 0.478]}
        scale={[w * 0.88, h * 0.035, d * 0.025]}
        rotation={[-0.18, 0, 0]}
      />
      <mesh
        geometry={plane}
        material={accent}
        position={[w * 0.35, -h * 0.11, d / 2 + 0.0003]}
        scale={[w * 0.025, h * 0.018, 1]}
      />
      <BrandMark
        name={manufacturer}
        width={Math.min(0.12, w * 0.2)}
        position={[0, h * 0.06, d / 2 + 0.0004]}
      />
      {selected && <SelectionOutline dimensions={[w, h, d]} />}
    </>
  );
}

function rectangularFrame(
  w: number,
  h: number,
  thickness: number,
  z: number,
): DetailPart[] {
  return [
    { position: [0, h / 2 - thickness / 2, z], scale: [w, thickness, 1] },
    { position: [0, -h / 2 + thickness / 2, z], scale: [w, thickness, 1] },
    {
      position: [-w / 2 + thickness / 2, 0, z],
      scale: [thickness, Math.max(0.001, h - thickness * 2), 1],
    },
    {
      position: [w / 2 - thickness / 2, 0, z],
      scale: [thickness, Math.max(0.001, h - thickness * 2), 1],
    },
  ];
}

function TerminalMesh({
  item,
  selected,
}: {
  item: Project["airTerminals"][number];
  selected: boolean;
}) {
  const w = item.widthMm / 1000,
    h = item.heightMm / 1000,
    d = (item.depthMm ?? 0) / 1000;
  const family = airTerminalFamilyAtVersion(item.family, item.catalogVersion);
  const variant = family?.variants.find((v) => v.id === item.productId);
  const front = item.mounting === "ceiling" ? -1 : 1;
  const z = (front * d) / 2;
  const detail = useMemo(() => {
    const frame = Math.min(0.012, h * 0.1, w * 0.1);
    const white = rectangularFrame(w, h, frame, z);
    const dark: DetailPart[] = [];
    if (variant?.slotCount && variant.slotWidthMm) {
      const slotHeight = Math.min(
        variant.slotWidthMm / 1000,
        (h - frame * 2) / variant.slotCount,
      );
      const spacing = (h - frame * 2) / variant.slotCount;
      for (let i = 0; i < variant.slotCount; i++)
        dark.push({
          position: [0, -h / 2 + frame + spacing * (i + 0.5), z],
          scale: [w - 2 * frame, slotHeight, 1],
        });
    } else if (family?.familyCode === "EADD") {
      dark.push({
        position: [0, 0, z],
        scale: [w - frame * 2, h - frame * 2, 1],
      });
      for (const factor of [0.78, 0.54, 0.3])
        white.push(...rectangularFrame(w * factor, h * factor, frame * 0.8, z));
      white.push({
        position: [0, 0, z],
        scale: [w * 0.17, h * 0.17, 1],
      });
    } else {
      dark.push({
        position: [0, 0, z],
        scale: [w - frame * 2, h - frame * 2, 1],
      });
      const count = Math.min(32, Math.max(3, Math.round(h / 0.018)));
      for (let i = 1; i < count; i++)
        white.push({
          position: [0, -h / 2 + frame + ((h - 2 * frame) * i) / count, z],
          scale: [w - frame * 2, Math.min(0.004, (h / count) * 0.3), 1],
        });
      if (family?.familyCode === "EGQ") {
        const columns = Math.min(32, Math.max(3, Math.round(w / 0.025)));
        for (let i = 1; i < columns; i++)
          white.push({
            position: [-w / 2 + frame + ((w - frame * 2) * i) / columns, 0, z],
            scale: [0.003, h - frame * 2, 1],
          });
      }
    }
    return { white, dark };
  }, [w, h, z, family, variant]);
  return (
    <>
      {d > 0 &&
        (item.shape === "circle" ? (
          <mesh
            geometry={cylinder}
            material={aluminium}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[w / 2, d, h / 2]}
            castShadow
            receiveShadow
          />
        ) : (
          <mesh
            geometry={box}
            material={aluminium}
            scale={[w, h, d]}
            castShadow
            receiveShadow
          />
        ))}
      {item.shape === "circle" ? (
        <>
          <mesh
            geometry={circle}
            material={recess}
            position={[0, 0, z]}
            scale={[w / 2, h / 2, 1]}
          />
          <mesh
            geometry={ring}
            material={whiteFace}
            position={[0, 0, z]}
            scale={[w / 2, h / 2, 1]}
          />
          <mesh
            geometry={circle}
            material={whiteFace}
            position={[0, 0, z]}
            scale={[w * 0.31, h * 0.31, 1]}
          />
        </>
      ) : (
        <>
          {variant?.slotCount && (
            <mesh
              geometry={plane}
              material={faceBacking}
              position={[0, 0, z]}
              scale={[w, h, 1]}
            />
          )}
          <Parts parts={detail.dark} geometry={plane} material={recess} />
          <Parts parts={detail.white} geometry={plane} material={whiteFace} />
        </>
      )}
      {selected && <SelectionOutline dimensions={[w, h, d || 0.001]} />}
    </>
  );
}

export type DeviceMeshesProps = {
  project: Project;
  activeFloorId: string;
  selection: Selection[];
  isolatedRoomId?: string;
  onSelect: (selection: Selection) => void;
};

/** Local axes are width X, height Y, depth Z. Project plan Y maps to world Z. */
export function DeviceMeshes({
  project,
  activeFloorId,
  selection,
  isolatedRoomId,
  onSelect,
}: DeviceMeshesProps) {
  const visible = (item: { floorId: string; roomId: string }) =>
    item.floorId === activeFloorId &&
    (!isolatedRoomId || item.roomId === isolatedRoomId);
  const selected = (id: string) =>
    selection.some((s) => s.kind === "device" && s.id === id);
  const choose = (id: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect({ kind: "device", id });
  };
  return (
    <group dispose={null}>
      {project.radiators.filter(visible).map((item) => (
        <group
          key={item.id}
          position={[
            item.position.x,
            0.1 + item.heightMm / 2000,
            item.position.y,
          ]}
          rotation={[0, -item.rotation, 0]}
          onClick={choose(item.id)}
        >
          <RadiatorMesh item={item} selected={selected(item.id)} />
        </group>
      ))}
      {project.hvacSystems
        .filter((s) => s.type === "split")
        .flatMap((system) =>
          system.indoorUnits.filter(visible).map((item) => {
            const room = project.rooms.find((r) => r.id === item.roomId);
            return room ? (
              <group
                key={item.id}
                position={[
                  item.position.x,
                  splitCenterElevationM(room, item),
                  item.position.y,
                ]}
                rotation={[0, -item.rotation, 0]}
                onClick={choose(item.id)}
              >
                <SplitMesh
                  item={item}
                  manufacturer={system.manufacturer}
                  selected={selected(item.id)}
                />
              </group>
            ) : null;
          }),
        )}
      {project.airTerminals
        .filter(visible)
        .filter((item) => !needsTerminalReconfiguration(item))
        .map((item) => (
          <group
            key={item.id}
            position={[
              item.position.x,
              item.elevationM! +
                (item.mounting === "ceiling" ? (item.depthMm ?? 0) / 2000 : 0),
              item.position.y,
            ]}
            rotation={
              item.mounting === "ceiling"
                ? [Math.PI / 2, 0, item.rotation]
                : [0, -item.rotation, 0]
            }
            onClick={choose(item.id)}
          >
            <TerminalMesh item={item} selected={selected(item.id)} />
          </group>
        ))}
    </group>
  );
}
