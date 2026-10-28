"use client";
import { Suspense, useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Project } from "@/schemas/project";
import { ArchitectureMeshes } from "@/configurator/viewer3d/ArchitectureMeshes";
import { floorOffsetM } from "@/configurator/viewer3d/ContextFloors";
import { DeviceMeshes } from "@/configurator/viewer3d/DeviceMeshes";
import { DuctMeshes } from "@/configurator/viewer3d/DuctMeshes";
import { RenderBoundary } from "./export";

const noSelection = () => {};

/** Piani con quota relativa al più basso, che sta a terra. */
function floorOffsets(project: Project) {
  const { floors } = project;
  const lowest = floors.reduce((a, b) => (b.elevationM < a.elevationM ? b : a));
  const storeyM = project.projectSettings.defaultHeightM;
  const raw = floors.map((floor) => ({
    floor,
    offsetM: floorOffsetM(floors, floor, lowest, storeyM),
  }));
  const min = Math.min(...raw.map((item) => item.offsetM));
  return raw.map((item) => ({ ...item, offsetM: item.offsetM - min }));
}

/** GLTFExporter disegna le texture su canvas: i DataTexture procedurali (flessibili, pietra, intonaco) vanno copiati su canvas, senza toccare quelle condivise col 3D. */
function bakeDataTextures(root: THREE.Object3D) {
  const baked = new Map<THREE.Texture, THREE.CanvasTexture>();
  const bake = (texture: THREE.Texture) => {
    const data = (texture.image as { data?: Uint8Array } | null)?.data;
    if (!(texture instanceof THREE.DataTexture) || !(data instanceof Uint8Array))
      return texture;
    let copy = baked.get(texture);
    if (!copy) {
      const { width, height } = texture.image;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas
        .getContext("2d")!
        .putImageData(
          new ImageData(new Uint8ClampedArray(data), width, height),
          0,
          0,
        );
      copy = new THREE.CanvasTexture(canvas);
      copy.wrapS = texture.wrapS;
      copy.wrapT = texture.wrapT;
      copy.colorSpace = texture.colorSpace;
      baked.set(texture, copy);
    }
    return copy;
  };
  const clones = new Map<THREE.Material, THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material) => {
      const slots = Object.entries(material).filter(
        ([, value]) => (value as THREE.Texture | null)?.isTexture,
      ) as [string, THREE.Texture][];
      if (!slots.some(([, texture]) => bake(texture) !== texture))
        return material;
      let clone = clones.get(material);
      if (!clone) {
        clone = material.clone();
        for (const [slot, texture] of slots)
          (clone as unknown as Record<string, THREE.Texture>)[slot] =
            bake(texture);
        clones.set(material, clone);
      }
      return clone;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(swap)
      : swap(mesh.material);
  });
}

function Export({
  group,
  ready,
  resolve,
  reject,
}: {
  group: React.RefObject<THREE.Group | null>;
  ready: boolean;
  resolve: (glb: ArrayBuffer) => void;
  reject: (error: Error) => void;
}) {
  const frames = useRef(0);
  const finished = useRef(false);
  useFrame(() => {
    const root = group.current;
    if (!ready || !root || finished.current || ++frames.current < 6) return;
    finished.current = true;
    // Plastico da tavolo (al massimo 1 m), con origine al centro e a terra.
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty())
      return reject(Error("Nessuna geometria da condividere."));
    const size = box.getSize(new THREE.Vector3());
    const k = Math.min(1, 1 / Math.max(size.x, size.z, 0.001));
    root.scale.setScalar(k);
    root.position.set(
      (-(box.min.x + box.max.x) / 2) * k,
      -box.min.y * k,
      (-(box.min.z + box.max.z) / 2) * k,
    );
    root.updateMatrixWorld(true);
    bakeDataTextures(root);
    new GLTFExporter().parse(
      root,
      (result) =>
        result instanceof ArrayBuffer
          ? resolve(result)
          : reject(Error("Esportazione GLB non riuscita.")),
      (error) =>
        reject(
          Error(
            `Esportazione GLB non riuscita: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      { binary: true },
    );
  });
  return null;
}

function HouseScene({
  project,
  resolve,
  reject,
}: {
  project: Project;
  resolve: (glb: ArrayBuffer) => void;
  reject: (error: Error) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const floors = floorOffsets(project);
  const [done, setDone] = useState(0);
  const onReady = useCallback(() => setDone((count) => count + 1), []);
  return (
    <Canvas
      frameloop="always"
      dpr={1}
      gl={{ antialias: false }}
      fallback={<span>WebGL non disponibile.</span>}
    >
      <Suspense fallback={null}>
        <group ref={group} name="Casa">
          {floors.map(({ floor, offsetM }) => (
            <group key={floor.id} name={floor.name} position={[0, offsetM, 0]}>
              <ArchitectureMeshes
                walls={project.walls.filter((w) => w.floorId === floor.id)}
                rooms={project.rooms.filter((r) => r.floorId === floor.id)}
                openings={project.openings.filter(
                  (o) => o.floorId === floor.id,
                )}
                defaultHeightM={project.projectSettings.defaultHeightM}
                selection={[]}
                onSelect={noSelection}
                onReady={onReady}
              />
              <DeviceMeshes
                project={project}
                activeFloorId={floor.id}
                selection={[]}
                onSelect={noSelection}
                showHydronicPipes
              />
              <DuctMeshes
                project={project}
                activeFloorId={floor.id}
                animated={false}
              />
            </group>
          ))}
        </group>
        <Export
          group={group}
          ready={done >= floors.length}
          resolve={resolve}
          reject={reject}
        />
      </Suspense>
    </Canvas>
  );
}

async function houseGlb(project: Project) {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "800px",
    height: "600px",
    pointerEvents: "none",
  });
  container.dataset.staianoArExport = "true";
  document.body.appendChild(container);
  const root = createRoot(container);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(Error("Preparazione AR troppo lenta. Riprova.")),
        45000,
      );
      root.render(
        <RenderBoundary onError={reject}>
          <HouseScene project={project} resolve={resolve} reject={reject} />
        </RenderBoundary>,
      );
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    root.unmount();
    container.remove();
  }
}

/** Esporta tutti i piani in GLB e crea il link AR da 30 minuti. */
export async function shareHouseAr(project: Project) {
  if (
    !project.floors.length ||
    (!project.walls.length && !project.rooms.length)
  )
    throw Error("Disegna almeno un muro o una stanza prima di condividere.");
  const glb = await houseGlb(structuredClone(project));
  const response = await fetch("/api/ar/house", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-AR-Label": encodeURIComponent(project.name),
    },
    body: glb,
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.message);
  return body as { urls: string[]; expiresAt: number };
}
