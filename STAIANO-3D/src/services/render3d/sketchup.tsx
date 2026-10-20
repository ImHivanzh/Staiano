"use client";
import { Suspense, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Project } from "@/schemas/project";
import type { SketchupModel } from "@/services/export/sketchup-schema";
import { ArchitectureMeshes } from "@/configurator/viewer3d/ArchitectureMeshes";
import { DeviceMeshes } from "@/configurator/viewer3d/DeviceMeshes";
import { DuctMeshes } from "@/configurator/viewer3d/DuctMeshes";
import { sketchupMeshes } from "./sketchup-geometry";
import { RenderBoundary } from "./export";
import { downloadFile } from "@/services/project/format";

const noSelection = () => {};
function Capture({
  group,
  ready,
  resolve,
  reject,
}: {
  group: React.RefObject<THREE.Group | null>;
  ready: boolean;
  resolve: (meshes: SketchupModel["meshes"]) => void;
  reject: (error: Error) => void;
}) {
  const frames = useRef(0),
    finished = useRef(false);
  useFrame(() => {
    if (!ready || !group.current || finished.current || ++frames.current < 6)
      return;
    finished.current = true;
    try {
      resolve(sketchupMeshes(group.current));
    } catch (error) {
      reject(
        error instanceof Error
          ? error
          : Error("Geometrie SKP non esportabili."),
      );
    }
  });
  return null;
}
function ModelScene({
  project,
  floorId,
  resolve,
  reject,
}: {
  project: Project;
  floorId: string;
  resolve: (meshes: SketchupModel["meshes"]) => void;
  reject: (error: Error) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <Canvas
      frameloop="always"
      dpr={1}
      gl={{ antialias: false }}
      fallback={<span>WebGL non disponibile.</span>}
    >
      <Suspense fallback={null}>
        <group ref={group} name="Staiano">
          <group name="Planimetria e muri">
            <ArchitectureMeshes
              walls={project.walls.filter((w) => w.floorId === floorId)}
              rooms={project.rooms.filter((r) => r.floorId === floorId)}
              openings={project.openings}
              defaultHeightM={project.projectSettings.defaultHeightM}
              selection={[]}
              onSelect={noSelection}
              onReady={onReady}
            />
          </group>
          <group name="Apparecchi">
            <DeviceMeshes
              project={project}
              activeFloorId={floorId}
              selection={[]}
              onSelect={noSelection}
              showHydronicPipes
            />
          </group>
          <group name="Canalizzazioni">
            <DuctMeshes
              project={project}
              activeFloorId={floorId}
              animated={false}
            />
          </group>
        </group>
        <Capture
          group={group}
          ready={ready}
          resolve={resolve}
          reject={reject}
        />
      </Suspense>
    </Canvas>
  );
}

async function modelGeometry(project: Project, floorId: string) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "800px",
    height: "600px",
    pointerEvents: "none",
  });
  container.dataset.staianoSkpExport = "true";
  document.body.appendChild(container);
  const root = createRoot(container);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<SketchupModel["meshes"]>((resolve, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            Error(
              "Preparazione SKP troppo lenta. Verifica la vista 3D e riprova.",
            ),
          ),
        30000,
      );
      root.render(
        <RenderBoundary onError={reject}>
          <ModelScene
            project={project}
            floorId={floorId}
            resolve={resolve}
            reject={reject}
          />
        </RenderBoundary>,
      );
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    root.unmount();
    container.remove();
  }
}
async function pngBackground(
  background: NonNullable<SketchupModel["background"]>,
) {
  if (background.widthPx * background.heightPx > 40000000)
    throw Error(
      "Planimetria troppo grande per SKP. Riduci la risoluzione dello sfondo.",
    );
  if (background.dataUrl.startsWith("data:image/png;base64,"))
    return background;
  const image = new Image();
  image.src = background.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw Error("Conversione dello sfondo non disponibile.");
  context.drawImage(image, 0, 0);
  return {
    ...background,
    dataUrl: canvas.toDataURL("image/png"),
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}

export async function downloadSketchup(project: Project, floorId: string) {
  const snapshot = structuredClone(project),
    floor = snapshot.floors.find((f) => f.id === floorId);
  if (!floor) throw Error("Piano non disponibile.");
  const status = await fetch("/api/export/sketchup", { cache: "no-store" });
  if (!status.ok || !(await status.json()).available)
    throw Error(
      "Esportazione SKP richiede SketchUp installato sul PC del server.",
    );
  const meshes = await modelGeometry(snapshot, floorId);
  const background = floor.background
    ? await pngBackground(floor.background)
    : null;
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 150000);
  try {
    const response = await fetch("/api/export/sketchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${snapshot.name} - ${floor.name}`,
        meshes,
        background,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = await response.json();
      throw Error(error.message || "Esportazione SKP non riuscita.");
    }
    const name = `${snapshot.name}-${floor.name}`
      .replace(/[^a-zA-Z0-9àèéìòù _-]/g, "")
      .slice(0, 130);
    downloadFile(`${name || "Staiano"}.skp`, await response.blob());
  } finally {
    clearTimeout(timeout);
  }
}
