"use client";
import { RoomCeiling3D } from "@/configurator/viewer3d/RoomCeiling3D";

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Project, Room } from "@/schemas/project";
import { ArchitectureMeshes } from "@/configurator/viewer3d/ArchitectureMeshes";
import { DeviceMeshes } from "@/configurator/viewer3d/DeviceMeshes";
import { SceneLighting } from "@/configurator/viewer3d/SceneLighting";
import { SceneEffects } from "@/configurator/viewer3d/SceneEffects";
import { CameraRig } from "@/configurator/viewer3d/CameraRig";
import { CeilingReference } from "@/configurator/viewer3d/CeilingReference";
import { sceneFrame } from "@/configurator/viewer3d/scene-layout";
import { projectOutdoorUnits } from "@/domain/hydronic/placement";

export type ProjectPanorama = {
  title: string;
  floorId: string;
  roomId?: string;
  bytes: Uint8Array;
  mimeType: "image/jpeg";
  width: number;
  height: number;
};
export type PanoramaOptions = {
  floorId?: string;
  roomId?: string;
  floorFinish?: "oak" | "stone";
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const WIDTH = 1600;
const HEIGHT = 900;
const noSelection = () => undefined;
const abortError = () =>
  new DOMException("Esportazione render annullata.", "AbortError");

export class RenderBoundary extends Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Runs after the shared postprocessing pass, then captures the actual GPU buffer. */
function Capture({
  ready,
  onCapture,
  onError,
}: {
  ready: boolean;
  onCapture: (bytes: Uint8Array) => void;
  onError: (error: Error) => void;
}) {
  const frames = useRef(0);
  const started = useRef<number | null>(null);
  const completed = useRef(false);
  const { gl } = useThree();
  useEffect(() => {
    const lost = () =>
      onError(
        new Error("Contesto WebGL perso durante la generazione del render."),
      );
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onError]);
  useFrame(({ gl, scene }) => {
    if (completed.current || !ready) return;
    started.current ??= performance.now();
    frames.current++;
    if (frames.current < 6 || performance.now() - started.current < 120) return;
    let texturesReady = true;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials)
        if (material instanceof THREE.MeshStandardMaterial)
          for (const texture of [
            material.map,
            material.normalMap,
            material.roughnessMap,
          ]) {
            const image = texture?.image;
            if (image instanceof HTMLImageElement && !image.complete)
              texturesReady = false;
          }
    });
    if (!texturesReady) return;
    completed.current = true;
    try {
      const data = gl.domElement.toDataURL("image/jpeg", 0.91);
      if (!data.startsWith("data:image/jpeg;base64,"))
        throw new Error(
          "Il dispositivo non riesce a esportare un render JPEG.",
        );
      const binary = atob(data.slice(data.indexOf(",") + 1));
      onCapture(
        Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error
          : new Error("Cattura render 3D non riuscita."),
      );
    }
  }, 2);
  return null;
}

function PanoramaScene({
  project,
  floorId,
  room,
  floorFinish,
  onCapture,
  onError,
}: {
  project: Project;
  floorId: string;
  room?: Room;
  floorFinish?: "oak" | "stone";
  onCapture: (bytes: Uint8Array) => void;
  onError: (error: Error) => void;
}) {
  const rooms = project.rooms.filter(
    (r) => r.floorId === floorId && (!room || r.id === room.id),
  );
  const walls = project.walls.filter(
    (w) => w.floorId === floorId && (!room || room.wallIds.includes(w.id)),
  );
  const fullFrame = sceneFrame(
    walls,
    rooms,
    project.projectSettings.defaultHeightM,
    room
      ? []
      : projectOutdoorUnits(project).filter((unit) => unit.floorId === floorId),
  );
  const roomPadding = Math.max(0.1, ...walls.map((wall) => wall.thickness));
  const frame = room
    ? {
        minX: Math.min(...room.polygon.map((point) => point.x)) - roomPadding,
        maxX: Math.max(...room.polygon.map((point) => point.x)) + roomPadding,
        minZ: Math.min(...room.polygon.map((point) => point.y)) - roomPadding,
        maxZ: Math.max(...room.polygon.map((point) => point.y)) + roomPadding,
        height: Math.max(
          room.heightM,
          ...walls.map((wall) => wall.height ?? 0),
        ),
      }
    : fullFrame;
  const [cutWallIds, setCutWallIds] = useState(new Set<string>());
  const [materialsReady, setMaterialsReady] = useState(false);
  const onArchitectureReady = useCallback(() => setMaterialsReady(true), []);
  return (
    <Canvas
      dpr={1}
      shadows={{ type: THREE.PCFShadowMap }}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      camera={{ fov: 38, near: 0.02, far: 10000 }}
      frameloop="always"
      fallback={<span>WebGL non disponibile per il render 3D.</span>}
    >
      <Suspense fallback={null}>
        <SceneLighting frame={frame} rooms={rooms} revision={cutWallIds.size} />
        <ArchitectureMeshes
          walls={walls}
          rooms={rooms}
          openings={project.openings}
          defaultHeightM={project.projectSettings.defaultHeightM}
          selection={[]}
          onSelect={noSelection}
          cutWallIds={cutWallIds}
          isolatedRoom={room}
          floorFinish={floorFinish}
          onReady={onArchitectureReady}
        />
        <DeviceMeshes
          project={project}
          activeFloorId={floorId}
          selection={[]}
          isolatedRoomId={room?.id}
          onSelect={noSelection}
        />
        {rooms.map((r) => (
          <RoomCeiling3D key={r.id} project={project} room={r} transparent />
        ))}
        {rooms
          .filter((r) =>
            project.airTerminals.some(
              (t) =>
                t.roomId === r.id &&
                t.mounting === "ceiling" &&
                !t.legacyUnverified,
            ),
          )
          .map((r) => (
            <CeilingReference key={r.id} room={r} />
          ))}
        <CameraRig
          frame={frame}
          top={false}
          fitKey={`${floorId}|${room?.id ?? ""}`}
          walls={walls}
          rooms={rooms}
          cutaway
          onCutWalls={setCutWallIds}
        />
        <SceneEffects enabled={walls.length < 150} />
        <Capture
          ready={materialsReady}
          onCapture={onCapture}
          onError={onError}
        />
      </Suspense>
    </Canvas>
  );
}

async function renderView(
  project: Project,
  floorId: string,
  room: Room | undefined,
  options: PanoramaOptions,
): Promise<Uint8Array> {
  options.signal?.throwIfAborted();
  const container = document.createElement("div");
  container.dataset.staianoRenderExport = "true";
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
    pointerEvents: "none",
    overflow: "hidden",
  });
  document.body.appendChild(container);
  const root = createRoot(container);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      const succeed = (bytes: Uint8Array) => {
        if (!settled) {
          settled = true;
          resolve(bytes);
        }
      };
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      abortListener = () => fail(abortError());
      options.signal?.addEventListener("abort", abortListener, { once: true });
      if (options.signal?.aborted) {
        abortListener();
        return;
      }
      timeout = setTimeout(
        () =>
          fail(
            new Error(
              "Render 3D non disponibile o troppo lento. Verifica la vista 3D e riprova: il dossier richiede il render.",
            ),
          ),
        30000,
      );
      root.render(
        <RenderBoundary onError={fail}>
          <PanoramaScene
            project={project}
            floorId={floorId}
            room={room}
            floorFinish={options.floorFinish ?? project.floorFinish ?? "oak"}
            onCapture={succeed}
            onError={fail}
          />
        </RenderBoundary>,
      );
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    if (abortListener)
      options.signal?.removeEventListener("abort", abortListener);
    // Never remove DOM owned by a live React root.
    root.unmount();
    if (container.parentNode === document.body)
      document.body.removeChild(container);
  }
}

/** Local project snapshot; one panorama per populated floor and optional selected room. */
export async function renderProjectPanoramas(
  project: Project,
  options: PanoramaOptions = {},
): Promise<ProjectPanorama[]> {
  if (typeof document === "undefined")
    throw new Error("I render 3D richiedono un browser con WebGL.");
  options.signal?.throwIfAborted();
  const snapshot = structuredClone(project);
  const selectedRoom = options.roomId
    ? snapshot.rooms.find((r) => r.id === options.roomId)
    : undefined;
  if (options.roomId && !selectedRoom)
    throw new Error("Ambiente per il render non disponibile.");
  const requestedFloor = options.floorId ?? selectedRoom?.floorId;
  if (requestedFloor && !snapshot.floors.some((f) => f.id === requestedFloor))
    throw new Error("Piano per il render non disponibile.");
  if (selectedRoom && selectedRoom.floorId !== requestedFloor)
    throw new Error("Ambiente e piano del render non corrispondono.");
  const floors = snapshot.floors.filter(
    (f) =>
      (!requestedFloor || f.id === requestedFloor) &&
      snapshot.walls.some((w) => w.floorId === f.id),
  );
  const views = floors.map((floor) => ({
    floorId: floor.id,
    title: `${floor.name} - panoramica 3D`,
    room: undefined as Room | undefined,
  }));
  if (selectedRoom && floors.some((f) => f.id === selectedRoom.floorId))
    views.push({
      floorId: selectedRoom.floorId,
      title: `${selectedRoom.name || "Ambiente"} - vista 3D`,
      room: selectedRoom,
    });
  const images: ProjectPanorama[] = [];
  for (const [index, view] of views.entries()) {
    options.signal?.throwIfAborted();
    options.onProgress?.(`Render ${index + 1}/${views.length}: ${view.title}`);
    const bytes = await renderView(snapshot, view.floorId, view.room, options);
    images.push({
      title: view.title,
      floorId: view.floorId,
      ...(view.room ? { roomId: view.room.id } : {}),
      bytes,
      mimeType: "image/jpeg",
      width: WIDTH,
      height: HEIGHT,
    });
  }
  return images;
}
