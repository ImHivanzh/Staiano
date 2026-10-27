"use client";

import { useEffect, useMemo, lazy, Suspense } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Project, Selection } from "@/schemas/project";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import EcoclimaLinearBody from "./EcoclimaLinearBody";
import { EcoclimaGrille } from "./EcoclimaGrille";
import {
  splitCenterElevationM,
  roomCeilingHeightM,
} from "@/domain/air-conditioning/elevation";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { radiatorDetail, type DetailPart } from "./device-detail";
import {
  airTerminalFaceWidthMm,
  terminalBodyDepthMm,
} from "@/domain/air-terminals/geometry";
import { resolveRadiatorFinish } from "@/domain/catalogs/radiator-finishes";
import { RadiatorHardware } from "./RadiatorHardware";
import { Parts } from "./Parts";
import { ModelAssetBoundary } from "./ModelAssetBoundary";
import { radiatorSectionFor } from "@/domain/catalogs/radiator-sections";
import { globalSectionFor } from "@/domain/catalogs/global-sections";
const ArdesiaBody = lazy(() => import("./ArdesiaBody"));
const GlobalBody = lazy(() => import("./GlobalBody"));
import { SystemMeshes } from "./SystemMeshes";
import { FanCoilMeshes } from "./FanCoilMeshes";
import { HydronicMeshes } from "./HydronicMeshes";
import { AirOutdoorMeshes } from "./AirOutdoorMeshes";
import { splitIndoorAtVersion } from "@/domain/catalogs/splits";
import { vrvIndoorAtVersion } from "@/domain/catalogs/vrv";
import { cassetteDetail, roundCassetteGrille } from "./cassette-detail";
import { terminalFaceDetail } from "./terminal-detail";
import { Html, Line, MeshReflectorMaterial } from "@react-three/drei";
import { pendingConnections } from "@/domain/ducted/plan-connections";

const box = new THREE.BoxGeometry(1, 1, 1);
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const cassetteCylinder = new THREE.CylinderGeometry(1, 1, 1, 64);
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
// Foto ufficiali: Gree Airy in alluminio spazzolato, LG Mirror nero lucido.
const splitFinish: Record<string, THREE.MeshStandardMaterial> = {
  Airy: new THREE.MeshStandardMaterial({
    color: "#b9bcbf",
    roughness: 0.38,
    metalness: 0.55,
  }),
  Mirror: new THREE.MeshStandardMaterial({
    color: "#1c1e20",
    roughness: 0.16,
    metalness: 0.3,
  }),
};
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
const recess = new THREE.MeshStandardMaterial({
  color: "#242c31",
  roughness: 0.82,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const deepRecess = new THREE.MeshStandardMaterial({
  color: "#242c31",
  roughness: 0.82,
  side: THREE.DoubleSide,
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
  const section = radiatorSectionFor(
    item,
    radiatorProductAtVersion(item.productId, item.catalogVersion),
  );
  const globalSection = globalSectionFor(
    item,
    radiatorProductAtVersion(item.productId, item.catalogVersion),
  );
  const sketchBody = (
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
        geometry={detail.mirrors.length ? box : rounded}
        material={bodyMaterial}
      />
      {detail.mirrors.map((part, index) => (
        <mesh
          key={index}
          geometry={plane}
          position={part.position}
          scale={part.scale}
        >
          <MeshReflectorMaterial
            resolution={256}
            mirror={1}
            roughness={0.05}
            color="#dce3e6"
          />
        </mesh>
      ))}
      <Parts parts={detail.fins} geometry={box} material={bodyMaterial} />
    </>
  );
  return (
    <>
      {section ? (
        <ModelAssetBoundary key={section.localUrl} fallback={sketchBody}>
          <Suspense fallback={sketchBody}>
            <ArdesiaBody
              section={section}
              heightMm={item.heightMm}
              elements={item.elements}
              material={bodyMaterial}
            />
          </Suspense>
        </ModelAssetBoundary>
      ) : globalSection ? (
        <ModelAssetBoundary key={globalSection.url} fallback={sketchBody}>
          <Suspense fallback={sketchBody}>
            <GlobalBody
              section={globalSection}
              heightMm={item.heightMm}
              elements={item.elements}
              material={bodyMaterial}
            />
          </Suspense>
        </ModelAssetBoundary>
      ) : (
        sketchBody
      )}
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
  const product =
    splitIndoorAtVersion(item.productId, item.catalogVersion) ??
    vrvIndoorAtVersion(item.productId, item.catalogVersion);
  const family = product?.family;
  const ceiling =
    (product && "mounting" in product && product.mounting === "ceiling") ||
    item.mounting === "ceiling";
  const roundCassette =
    ceiling && product && "shape" in product && product.shape === "round";
  const cassette = useMemo(
    () => cassetteDetail(item.widthMm, item.heightMm, item.depthMm),
    [item.widthMm, item.heightMm, item.depthMm],
  );
  const bodyMaterial = splitFinish[family ?? ""] ?? plastic;
  const emura = family === "Emura";
  const mirrored = family === "Mirror";
  const dualVane = family === "MSZ-LN";
  const flat =
    family === "Stylish" || family === "MSZ-EF" || dualVane || mirrored;
  // Missing OEM mesh: documentary family cues within the saved metric envelope.
  const body = useMemo(
    () =>
      new RoundedBoxGeometry(
        w,
        h,
        emura ? d * 0.84 : d,
        4,
        Math.min(flat ? 0.008 : emura ? 0.045 : 0.025, h / 7, d / 6),
      ),
    [w, h, d, emura, flat],
  );
  const curvedFront = useMemo(() => {
    if (!emura) return null;
    const geometry = new THREE.PlaneGeometry(w * 0.94, h * 0.55, 32, 8);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      positions.setZ(
        i,
        d * 0.08 * Math.max(0, 1 - ((positions.getX(i) * 2) / w) ** 2),
      );
    geometry.computeVertexNormals();
    return geometry;
  }, [w, h, d, emura]);
  useEffect(() => () => curvedFront?.dispose(), [curvedFront]);
  useEffect(() => () => body.dispose(), [body]);
  const fins = useMemo<DetailPart[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        position: [(-0.42 + (i * 0.84) / 17) * w, -h * 0.32, d / 2 + 0.0015],
        scale: [0.003, h * 0.16, 0.002],
      })),
    [w, h, d],
  );
  const topFins = useMemo<DetailPart[]>(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        position: [(-0.43 + (i * 0.86) / 24) * w, h / 2 + 0.0005, -d * 0.08],
        scale: [0.005, 0.001, d * 0.55],
      })),
    [w, h, d],
  );
  const roundGrille = useMemo(
    () => roundCassetteGrille(item.widthMm, item.heightMm, item.depthMm),
    [item.widthMm, item.heightMm, item.depthMm],
  );
  return (
    <>
      {roundCassette ? (
        <>
          <mesh
            geometry={cassetteCylinder}
            material={plastic}
            scale={[w / 2, h, d / 2]}
            castShadow
            receiveShadow
          />
          <mesh
            geometry={cassetteCylinder}
            material={deepRecess}
            position={[0, -h / 2 - 0.0003, 0]}
            scale={[w * 0.45, 0.0005, d * 0.45]}
          />
          <mesh
            geometry={ring}
            material={plastic}
            position={[0, -h / 2 - 0.0007, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[w / 2, d / 2, 1]}
          />
          <mesh
            geometry={cassetteCylinder}
            material={plastic}
            position={[0, -h / 2 - 0.0008, 0]}
            scale={[w * 0.27, 0.0005, d * 0.27]}
          />
          <Parts parts={roundGrille} geometry={box} material={deepRecess} />
          {selected && <SelectionOutline dimensions={[w, h, d]} />}
        </>
      ) : ceiling ? (
        <>
          <Parts parts={[cassette.body]} geometry={box} material={aluminium} />
          <Parts parts={cassette.frame} geometry={rounded} material={plastic} />
          <Parts
            parts={[cassette.intake, ...cassette.outlets]}
            geometry={box}
            material={deepRecess}
          />
          <Parts
            parts={[...cassette.grille, ...cassette.vanes]}
            geometry={box}
            material={plastic}
          />
          {selected && <SelectionOutline dimensions={[w, h, d]} />}
        </>
      ) : (
        <>
          <mesh
            geometry={body}
            material={bodyMaterial}
            position={[0, 0, emura ? -d * 0.08 : 0]}
            castShadow
            receiveShadow
          />
          {mirrored && (
            <mesh
              geometry={plane}
              position={[0, h * 0.07, d / 2 + 0.0005]}
              scale={[w * 0.96, h * 0.7, 1]}
            >
              <MeshReflectorMaterial
                resolution={128}
                mirror={0.9}
                roughness={0.08}
                color="#777f86"
              />
            </mesh>
          )}
          {dualVane && (
            <mesh
              geometry={box}
              material={plastic}
              position={[0, -h * 0.35, d / 2 + 0.002]}
              scale={[0.007, h * 0.18, 0.004]}
            />
          )}
          {curvedFront && (
            <mesh
              geometry={curvedFront}
              material={plastic}
              position={[0, h * 0.14, d * 0.38]}
              castShadow
              receiveShadow
            />
          )}
          <mesh
            geometry={rounded}
            material={deepRecess}
            position={[0, -h * 0.31, d / 2 + 0.0002]}
            scale={[w * 0.89, h * 0.18, 0.001]}
          />
          <Parts parts={fins} geometry={box} material={aluminium} />
          <Parts parts={topFins} geometry={box} material={recess} />
          <mesh
            geometry={rounded}
            material={bodyMaterial}
            position={[0, -h * 0.405, d / 2 + 0.0015]}
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
            name={
              family === "Emura"
                ? "DAIKIN EMURA"
                : family === "Stylish"
                  ? "DAIKIN STYLISH"
                  : manufacturer
            }
            width={Math.min(0.12, w * 0.2)}
            position={[0, h * 0.06, d / 2 + 0.0004]}
          />
          {selected && <SelectionOutline dimensions={[w, h, d]} />}
        </>
      )}
    </>
  );
}

function TerminalMesh({
  item,
  selected,
  grilleOpen = false,
}: {
  item: Project["airTerminals"][number];
  selected: boolean;
  grilleOpen?: boolean;
}) {
  const w = airTerminalFaceWidthMm(item) / 1000,
    h = item.heightMm / 1000;
  const family = airTerminalFamilyAtVersion(item.family, item.catalogVersion);
  const variant = family?.variants.find((v) => v.id === item.productId);
  const d = (item.depthMm ?? terminalBodyDepthMm(family, variant) ?? 0) / 1000;
  const faceMaterial = useMemo(() => {
    const material = whiteFace.clone();
    if (/^#[0-9a-f]{6}$/i.test(item.color)) material.color.set(item.color);
    if (/opac|matt/i.test(item.finish)) material.roughness = 0.8;
    if (/lucid|gloss/i.test(item.finish)) material.roughness = 0.18;
    return material;
  }, [item.color, item.finish]);
  useEffect(() => () => faceMaterial.dispose(), [faceMaterial]);
  const plateMaterial = useMemo(() => {
    const material = faceMaterial.clone();
    material.polygonOffset = false;
    return material;
  }, [faceMaterial]);
  useEffect(() => () => plateMaterial.dispose(), [plateMaterial]);
  const z = d / 2 + 0.001;
  const detail = useMemo(
    () => terminalFaceDetail(family, variant, w, h, z, item.shape === "circle"),
    [w, h, z, family, variant, item.shape],
  );
  const grille = item.family === "EGA6" ? "ega6" : item.family === "EBL" ? "ebl" : item.family === "EGF" ? "egf" : ["EGF-PUSH", "EGFR-PUSH"].includes(item.family) ? "egf-push" : null;
  if (grille) {
    const fallback = <mesh geometry={box} material={aluminium} scale={[w, h, d || 0.001]} />;
    return <>
      <ModelAssetBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <group position={[0, 0, d / 2 - .024]}>
            <EcoclimaGrille model={grille} width={w} height={h} open={grilleOpen} color={item.color} />
          </group>
        </Suspense>
      </ModelAssetBoundary>
      {selected && <SelectionOutline dimensions={[w, h, d || 0.001]} />}
    </>;
  }
  const ecoclimaLinear = item.family === "EDLS" ? "edls" : /^EDFLB?-\d+$/.test(item.family) ? "edfl" : null;
  if (ecoclimaLinear && variant?.slotCount && variant.slotCount <= 6) {
    return <>
      <ModelAssetBoundary fallback={<mesh geometry={box} material={aluminium} scale={[w, h, d || 0.001]} />}>
        <Suspense fallback={<mesh geometry={box} material={aluminium} scale={[w, h, d || 0.001]} />}>
          <group position={[0, 0, d ? 0 : -0.026]}>
            <EcoclimaLinearBody family={ecoclimaLinear} count={variant.slotCount} width={w} height={h} depth={d || 0.052} color={item.color} whiteModel={item.family.startsWith("EDFLB")} supply={item.use === "supply"} slotWidthMm={variant.slotWidthMm} />
          </group>
        </Suspense>
      </ModelAssetBoundary>
      {selected && <SelectionOutline dimensions={[w, h, d || 0.052]} />}
    </>;
  }
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
      {item.shape === "circle" && !detail.plate && (
        <mesh
          geometry={circle}
          material={recess}
          position={[0, 0, z]}
          scale={[w / 2, h / 2, 1]}
        />
      )}
      {detail.plate && (
        <mesh
          geometry={item.shape === "circle" ? circle : plane}
          material={plateMaterial}
          position={[0, 0, z - 0.0005]}
          scale={item.shape === "circle" ? [w / 2, h / 2, 1] : [w, h, 1]}
        />
      )}
      <Parts parts={detail.dark} geometry={plane} material={recess} />
      <Parts parts={detail.holes} geometry={circle} material={recess} />
      <Parts parts={detail.rings} geometry={ring} material={faceMaterial} />
      <Parts parts={detail.discs} geometry={circle} material={faceMaterial} />
      <Parts parts={detail.white} geometry={plane} material={faceMaterial} />
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
  showHydronicPipes?: boolean;
  hideDuctedMachines?: boolean;
  openGrilleIds?: ReadonlySet<string>;
};

/** Local axes are width X, height Y, depth Z. Project plan Y maps to world Z. */
export function DeviceMeshes({
  project,
  activeFloorId,
  selection,
  isolatedRoomId,
  onSelect,
  showHydronicPipes = false,
  hideDuctedMachines = false,
  openGrilleIds,
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
      <SystemMeshes
        project={project}
        activeFloorId={activeFloorId}
        selection={selection}
        isolatedRoomId={isolatedRoomId}
        onSelect={onSelect}
        hideDuctedMachines={hideDuctedMachines}
      />
      <FanCoilMeshes
        project={project}
        activeFloorId={activeFloorId}
        selection={selection}
        isolatedRoomId={isolatedRoomId}
        onSelect={onSelect}
        hideDuctedMachines={hideDuctedMachines}
      />
      {!isolatedRoomId && (
        <HydronicMeshes
          project={project}
          floorId={activeFloorId}
          showPipes={showHydronicPipes}
          selection={selection}
          onSelect={onSelect}
        />
      )}
      <AirOutdoorMeshes
        project={project}
        floorId={activeFloorId}
        showPipes={showHydronicPipes && !isolatedRoomId}
        selection={selection}
        onSelect={onSelect}
      />
      {project.radiators.filter(visible).map((item) => (
        <group
          key={item.id}
          name={`Radiatore ${item.family}`}
          userData={{ sketchupGroup: true }}
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
        .filter((s) => s.type === "split" || s.type === "vrv")
        .flatMap((system) =>
          system.indoorUnits.filter(visible).map((item) => {
            const room = project.rooms.find((r) => r.id === item.roomId);
            return room ? (
              <group
                key={item.id}
                name={`Unità interna ${item.productId}`}
                userData={{ sketchupGroup: true }}
                position={[
                  item.position.x,
                  splitCenterElevationM(room, item, project),
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
      {pendingConnections(project)
        .filter(
          (line) =>
            line.floorId === activeFloorId &&
            line.points.length > 1 &&
            !isolatedRoomId,
        )
        .map((line) => (
          <Line
            key={line.id}
            points={line.points.map(
              (p) => [p.x, 2.4, p.y] as [number, number, number],
            )}
            color="#b45309"
            lineWidth={2}
            dashed
            dashSize={0.12}
            gapSize={0.08}
          />
        ))}
      {[
        ...(project.ductedDrafts?.filter(visible) ?? []),
        ...(project.equipmentDrafts?.filter(visible) ?? []).map((item) => ({
          ...item,
          kind: item.type,
        })),
        ...(project.heatPumpDrafts ?? [])
          .filter((item) => item.floorId === activeFloorId && !isolatedRoomId)
          .map((item) => ({ ...item, roomId: "", kind: "heatPump" as const })),
      ].map((item) => (
        <group
          key={item.id}
          position={[
            item.position.x,
            item.kind === "heatPump"
              ? 0.5
              : (() => {
                  const room = project.rooms.find(
                    (room) => room.id === item.roomId,
                  );
                  return (
                    (room
                      ? roomCeilingHeightM(room)
                      : project.projectSettings.defaultHeightM) - 0.2
                  );
                })(),
            item.position.y,
          ]}
          onClick={choose(item.id)}
        >
          <mesh>
            <boxGeometry
              args={[
                item.kind !== "terminal" ? 0.8 : 0.5,
                item.kind === "heatPump" ? 1 : 0.12,
                0.24,
              ]}
            />
            <meshStandardMaterial color="#b45309" wireframe />
          </mesh>
          <Html
            center
            style={{
              pointerEvents: "none",
              whiteSpace: "nowrap",
              background: "#fdf3e3",
              color: "#b45309",
              padding: "2px 6px",
              fontSize: 12,
            }}
          >
            Da configurare
          </Html>
        </group>
      ))}
      {project.airTerminals
        .filter(visible)
        .filter((item) => !needsTerminalReconfiguration(item))
        .map((item) => (
          <group
            key={item.id}
            name={`Bocchetta ${item.family}`}
            userData={{ sketchupGroup: true }}
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
            <TerminalMesh item={item} selected={selected(item.id)} grilleOpen={openGrilleIds?.has(item.id)} />
          </group>
        ))}
    </group>
  );
}
