"use client";

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import Image from "next/image";
import type { Project } from "@/schemas/project";
import { calculateSupplyPlenum } from "@/domain/ducted/plenum";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { formatNumber } from "@/utils/format";
import {
  plenumLayout,
  layoutFromMachineGeometry,
  type PlenumLayout,
  type PlenumPort,
} from "./plenum-layout";
import styles from "./PlenumPreview3D.module.css";
import { plenumTransitionGeometry } from "./plenum-transition";
import {
  machinePlenums,
  placedPlenumGeometry,
} from "@/domain/ducted/placement";
import { deviceCodes } from "@/services/export/device-codes";
import {
  plenumBranchGroups,
  plenumDiagramSvg,
} from "@/domain/ducted/plenum-diagram";

class PreviewFailure extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className={styles.unavailable}>
        Anteprima 3D non disponibile. Numero, diametri e portate restano nella
        distinta sottostante.
      </p>
    ) : (
      this.props.children
    );
  }
}

function Camera({
  size,
  center,
  reset,
  view,
  faceWidth,
  faceHeight,
}: {
  size: number;
  center: [number, number, number];
  reset: number;
  view: "isometric" | "front" | "top";
  faceWidth: number;
  faceHeight: number;
}) {
  const { camera, invalidate, size: viewport } = useThree();
  useEffect(() => {
    camera.position.set(
      center[0] + size * 0.82,
      center[1] + size * 0.57,
      center[2] + size * 1.35,
    );
    if (view === "front")
      camera.position.set(center[0], center[1], center[2] + size * 2);
    if (view === "top")
      camera.position.set(center[0], center[1] + size * 2, center[2] + 0.001);
    if (camera instanceof THREE.OrthographicCamera)
      Object.assign(camera, {
        zoom:
          view === "front"
            ? Math.min(
                viewport.width / (Math.max(0.2, faceWidth) * 1.3),
                viewport.height / (Math.max(0.2, faceHeight) * 1.7),
              )
            : Math.min(viewport.width, viewport.height) / (size * 1.3),
      });
    camera.lookAt(...center);
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    size,
    center,
    reset,
    invalidate,
    view,
    viewport.width,
    viewport.height,
    faceWidth,
    faceHeight,
  ]);
  return (
    <OrbitControls
      makeDefault
      target={center}
      minDistance={size * 0.65}
      maxDistance={size * 5}
      maxPolarAngle={Math.PI * 0.9}
      enableDamping
      dampingFactor={0.08}
    />
  );
}

function Port({ port }: { port: PlenumPort }) {
  const radius = port.diameterM / 2;
  return (
    <group position={port.position}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, port.collarLengthM / 2]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[radius, radius, port.collarLengthM, 40, 1, true]}
        />
        <meshStandardMaterial
          color="#c1ced3"
          metalness={0.67}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.0005]}>
        <circleGeometry args={[radius * 0.965, 40]} />
        <meshStandardMaterial color="#23414f" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0, port.collarLengthM]}>
        <ringGeometry args={[radius * 0.94, radius, 40]} />
        <meshStandardMaterial
          color="#d2dcdf"
          metalness={0.6}
          roughness={0.24}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, port.collarLengthM * 0.62]}>
        <torusGeometry args={[radius * 0.985, radius * 0.014, 6, 40]} />
        <meshStandardMaterial color="#bac8cd" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function LabelProjection({
  layout,
  elements,
}: {
  layout: PlenumLayout;
  elements: RefObject<Map<string, HTMLSpanElement>>;
}) {
  useFrame(({ camera, size, gl }) => {
    const projected = new THREE.Vector3();
    for (const port of layout.ports) {
      const element = elements.current.get(port.branch.id);
      if (!element) continue;
      projected
        .set(
          port.position[0],
          port.position[1] + port.diameterM / 2 + 0.035,
          port.position[2] + port.collarLengthM,
        )
        .project(camera);
      element.style.transform = `translate(${((projected.x + 1) * size.width) / 2}px,${((1 - projected.y) * size.height) / 2}px) translate(-50%,-100%)`;
      element.style.visibility =
        camera.position.z <= port.position[2] ||
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
          ? "hidden"
          : "visible";
    }
    gl.domElement.dataset.rendered = "true";
    gl.domElement.dataset.plenumPorts = String(layout.ports.length);
  });
  return null;
}

function Scene({
  layout,
  machine,
  elements,
  reset,
  view,
}: {
  layout: PlenumLayout;
  machine: [number, number, number] | null;
  elements: RefObject<Map<string, HTMLSpanElement>>;
  reset: number;
  view: "isometric" | "front" | "top";
}) {
  const [w, h, depth] = layout.body;
  const transition = useMemo(
    () =>
      plenumTransitionGeometry(layout.inlet, [w, h], layout.transitionDepthM),
    [layout.inlet, w, h, layout.transitionDepthM],
  );
  useEffect(() => () => transition.dispose(), [transition]);
  const machineDepth = machine?.[2] ?? 0;
  const extent = Math.max(
    w,
    h,
    machineDepth + depth + 0.35,
    machine?.[0] ?? 0,
    0.8,
  );
  const centerZ = (depth - machineDepth) / 2;
  const center = useMemo<[number, number, number]>(
    () => [0, 0, centerZ],
    [centerZ],
  );
  const bodyEdges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(w, h, layout.boxDepthM);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, [w, h, layout.boxDepthM]);
  useEffect(() => () => bodyEdges.dispose(), [bodyEdges]);
  return (
    <>
      <color attach="background" args={["#f1f5f2"]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#f4f9ff", "#80907c", 1.3]} />
      <directionalLight
        position={[extent, extent * 2, extent * 2]}
        intensity={2.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {machine && view !== "front" && (
        <group position={[0, 0, -machine[2] / 2 - 0.07]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={machine} />
            <meshStandardMaterial
              color="#e0e5e3"
              roughness={0.45}
              metalness={0.35}
            />
          </mesh>
          <mesh position={[0, 0, machine[2] / 2 + 0.0005]}>
            <planeGeometry args={[machine[0] * 0.9, machine[1] * 0.6]} />
            <meshStandardMaterial
              color="#849696"
              metalness={0.2}
              roughness={0.6}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * machine[0] * 0.46, machine[1] * 0.42, 0]}
            >
              <boxGeometry
                args={[machine[0] * 0.035, machine[1] * 0.07, machine[2] * 0.9]}
              />
              <meshStandardMaterial
                color="#a1b1b3"
                roughness={0.35}
                metalness={0.55}
              />
            </mesh>
          ))}
        </group>
      )}
      {machine && (
        <Line
          points={[
            [0, 0, -0.065],
            [0, 0, 0],
          ]}
          color="#567c8d"
          lineWidth={2}
          dashed
          dashSize={0.008}
          gapSize={0.006}
        />
      )}
      {layout.transitionDepthM > 0 && (
        <mesh geometry={transition}>
          <meshStandardMaterial
            color="#b7c6cc"
            metalness={0.5}
            roughness={0.42}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <group position={[0, 0, layout.transitionDepthM + layout.boxDepthM / 2]}>
        <mesh>
          <boxGeometry args={[w, h, layout.boxDepthM]} />
          <meshStandardMaterial
            color="#58b7cd"
            transparent
            opacity={0.24}
            roughness={0.4}
            metalness={0.05}
            depthWrite={false}
          />
        </mesh>
        <lineSegments geometry={bodyEdges}>
          <lineBasicMaterial color="#4b9aad" transparent opacity={0.72} />
        </lineSegments>
      </group>
      {layout.ports.map((port) => (
        <Port key={port.branch.id} port={port} />
      ))}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -Math.max(h, machine?.[1] ?? 0) / 2 - 0.04, 0]}
        receiveShadow
      >
        <planeGeometry args={[extent * 8, extent * 8]} />
        <shadowMaterial transparent opacity={0.1} />
      </mesh>
      <Camera
        size={extent}
        center={center}
        reset={reset}
        view={view}
        faceWidth={w}
        faceHeight={h}
      />
      <LabelProjection layout={layout} elements={elements} />
    </>
  );
}

/** Nominal outlet diameters are metric. The body/connector arrangement is schematic. */
export function PlenumPreview3D({
  project,
  systemId,
  grouped,
}: {
  project: Project;
  systemId: string;
  grouped: boolean;
}) {
  const result = useMemo(
    () => calculateSupplyPlenum(project, systemId),
    [project, systemId],
  );
  const system = project.hvacSystems.find(
    (item) => item.id === systemId && item.type === "ducted",
  );
  const product = system
    ? hvacProductAtVersion(system.productId, system.catalogVersion)
    : null;
  const savedPlenum = machinePlenums(project, systemId).find(
    (pl) => pl.use === "supply",
  );
  const codes = deviceCodes(project);
  const dimensions = system?.genericMachine ?? product;
  const machine: [number, number, number] | null =
    dimensions?.widthMm && dimensions.heightMm && dimensions.depthMm
      ? [
          dimensions.widthMm / 1000,
          dimensions.heightMm / 1000,
          dimensions.depthMm / 1000,
        ]
      : null;
  const layout = useMemo(
    () =>
      (
        savedPlenum
          ? placedPlenumGeometry(project, savedPlenum)
          : result.machineGeometry
      )
        ? layoutFromMachineGeometry(
            (savedPlenum
              ? placedPlenumGeometry(project, savedPlenum)
              : result.machineGeometry)!,
          )
        : plenumLayout(result.branches, product),
    [result.branches, result.machineGeometry, product, savedPlenum, project],
  );
  const elements = useRef(new Map<string, HTMLSpanElement>());
  const [reset, setReset] = useState(0);
  const [view, setView] = useState<"isometric" | "front" | "top">("front");
  const previewRef = useRef<HTMLElement>(null);
  const [viewError, setViewError] = useState("");
  return (
    <section
      ref={previewRef}
      className={styles.preview}
      aria-label="Schema 3D plenum di mandata"
    >
      <header>
        <div>
          <h4>
            {result.branches.length} attacchi numerati · {layout.ports.length}{" "}
            verificati
          </h4>
          <p>
            {result.systemName} ·{" "}
            {result.machineModel ?? "Macchina da verificare"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReset((value) => value + 1)}
          aria-label="Reimposta vista plenum"
        >
          Reimposta vista
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              if (document.fullscreenElement === previewRef.current)
                await document.exitFullscreen();
              else await previewRef.current?.requestFullscreen();
              setViewError("");
            } catch {
              setViewError(
                "Schermo intero non disponibile. La vista frontale resta utilizzabile.",
              );
            }
          }}
        >
          Espandi plenum / esci
        </button>
      </header>
      {viewError && (
        <p role="status" className={styles.notice}>
          {viewError}
        </p>
      )}
      <div className="azioni" aria-label="Vista tecnica plenum">
        {(["front", "isometric", "top"] as const).map((mode) => (
          <button
            className="bottone piccolo tenue"
            key={mode}
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
          >
            {
              {
                front: "Vista frontale",
                isometric: "Vista isometrica",
                top: "Vista dall’alto plenum",
              }[mode]
            }
          </button>
        ))}
      </div>
      <div className={styles.diagram} data-testid="plenum-preview-3d">
        <PreviewFailure>
          <Canvas
            key={view}
            orthographic={view !== "isometric"}
            shadows
            frameloop="demand"
            camera={{ fov: 42, near: 0.01, far: 200 }}
            dpr={[1, 1.5]}
            fallback={
              <p className={styles.unavailable}>
                WebGL non disponibile. Consulta la distinta stacchi.
              </p>
            }
          >
            <Scene
              layout={layout}
              machine={machine}
              elements={elements}
              reset={reset}
              view={view}
            />
          </Canvas>
        </PreviewFailure>
        <div className={styles.labels} aria-hidden="true">
          {layout.ports.map((port) => (
            <span
              className={styles.portLabel}
              key={port.branch.id}
              ref={(element) => {
                if (element) elements.current.set(port.branch.id, element);
                else elements.current.delete(port.branch.id);
              }}
            >
              {port.number} · Ø {port.branch.diameterMm}
            </span>
          ))}
        </div>
        <span className={styles.navigation}>
          Trascina per orbitare · Rotella per zoom
        </span>
      </div>
      <figure
        className={styles.schematic}
        data-testid="plenum-summary"
        data-grouped={grouped}
      >
        <figcaption>
          <strong>Schema macchina e stacchi</strong>
          <span>
            {result.machineModel ?? "Macchina da configurare"} ·{" "}
            {result.branches.length} stacchi di mandata
          </span>
        </figcaption>
        <Image
          unoptimized
          width={512}
          height={312}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(plenumDiagramSvg(result, grouped))}`}
          alt={`Schema riepilogativo: macchina ${result.machineModel ?? "da configurare"}, plenum e ${result.branches.length} stacchi ${grouped ? "raggruppati per diametro con portate totali" : "numerati con diametri e portate"}.`}
        />
      </figure>
      <p className={styles.notice}>
        {layout.geometry.bodyWidthMm !== null
          ? `Plenum per ${result.machineModel}: ${layout.geometry.bodyWidthMm} × ${layout.geometry.bodyHeightMm} mm, profondità totale ${layout.geometry.totalDepthMm} mm. `
          : "Specificare le quote dell’attacco macchina. "}
        Disposizione su {layout.rows} {layout.rows === 1 ? "fila" : "file"} e
        lunghezza dei collari illustrative; diametri nominali in proporzione
        metrica.
      </p>
      {machine ? (
        <p className={styles.machine}>
          Ingombro macchina{" "}
          {system?.genericMachine ? "dichiarato dall’operatore" : "da catalogo"}
          : {dimensions!.widthMm} × {dimensions!.heightMm} ×{" "}
          {dimensions!.depthMm} mm. Attacco di mandata da verificare sul disegno
          del modello.
        </p>
      ) : (
        <p className={styles.machine}>
          {result.machineGeometry?.inlet?.declaredManually
            ? `Macchina manuale ${result.machineModel}; portata massima ${formatNumber(result.machineAirflowM3h ?? 0)} m³/h. Attacco inserito dall’operatore; ingombro macchina non dichiarato.`
            : `Ingombro macchina non disponibile per ${result.machineModel ?? "modello"}; il corpo macchina non viene ricostruito.`}
        </p>
      )}
      <div className={styles.legend}>
        {grouped
          ? plenumBranchGroups(result.branches).map((branches) => (
              <div key={branches[0].id}>
                <span>{branches.length}×</span>
                <p>
                  <strong>
                    {branches.length} ×{" "}
                    {branches[0].diameterMm === null
                      ? "Ø da verificare"
                      : `Ø ${branches[0].diameterMm} mm`}
                  </strong>
                  <small>
                    {formatNumber(
                      branches.reduce(
                        (sum, branch) => sum + branch.airflowM3h,
                        0,
                      ),
                      1,
                    )}{" "}
                    m³/h totali ·{" "}
                    {branches.filter((branch) => branch.verified).length}/
                    {branches.length} diametri verificati
                  </small>
                </p>
              </div>
            ))
          : result.branches.map((branch, index) => (
              <div key={branch.id}>
                <span>{index + 1}</span>
                <p>
                  <strong>{branch.roomName}</strong>
                  <small>
                    {branch.terminalIds
                      .map((id) => codes.get(id) ?? id)
                      .join(", ")}{" "}
                    · {branch.terminalModels.join(", ")}
                  </small>
                  <small>
                    {branch.diameterMm === null
                      ? "Diametro da verificare"
                      : `Ø nominale ${branch.diameterMm} mm`}{" "}
                    · {formatNumber(branch.airflowM3h, 1)} m³/h
                    {branch.velocityMs !== null
                      ? ` · ${formatNumber(branch.velocityMs, 2)} m/s`
                      : ""}
                  </small>
                </p>
              </div>
            ))}
      </div>
      {!result.branches.length && (
        <p className={styles.notice}>
          Configura le bocchette di mandata per visualizzare numero e diametri
          degli stacchi.
        </p>
      )}
      {layout.ports.length < result.branches.length && (
        <p className={styles.notice}>
          Gli stacchi con diametro non verificato restano nella distinta e non
          ricevono una geometria inventata.
        </p>
      )}
      <p className={styles.machine}>
        Solo mandata. Ripresa separata · perdite di carico e ingombro esecutivo
        non calcolati.
      </p>
    </section>
  );
}
