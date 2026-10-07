"use client";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import {
  Columns,
  Snowflake,
  Wind,
  Camera,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { useProjectStore } from "@/stores/project-store";
import { bounds } from "@/domain/geometry/primitives";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { formatNumber } from "@/utils/format";
import { deviceCodes } from "@/services/export/device-codes";
import { ArchitectureMeshes } from "./ArchitectureMeshes";
import { DeviceMeshes } from "./DeviceMeshes";
import { CameraRig } from "./CameraRig";
import { SceneLighting } from "./SceneLighting";
import { SceneEffects } from "./SceneEffects";
import { RoomLabelProjection } from "./RoomLabels";
import { CeilingReference } from "./CeilingReference";
import { ProductTools } from "./ProductTools";
import { SupplyPlenumPanel } from "@/configurator/systems/SupplyPlenumPanel";
import { sceneFrame, type SceneFrame } from "./scene-layout";
import styles from "./Viewer3D.module.css";
import type { Project } from "@/schemas/project";
import { DeviceTransform, type TransformMode } from "./DeviceTransform";
import { DuctMeshes } from "./DuctMeshes";
import { DuctPanel } from "@/configurator/systems/DuctPanel";
import { LoadMap } from "./LoadMap";
import { PillarDialog } from "@/configurator/PillarDialog";
import { roomMeasuredSides } from "@/domain/geometry/dimensions";
import { systemLinearBalances } from "@/domain/air-terminals/linear-meters";
import { HydronicPanel } from "@/configurator/systems/HydronicPanel";
import { FanCoilPanel } from "@/configurator/systems/FanCoilPanel";
import { ComfortFlows } from "./ComfortFlows";
import type { ComfortMode } from "./comfort-fields";

class WebGLError extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="vuoto">
        Vista 3D non disponibile sul dispositivo. La planimetria resta
        modificabile in 2D.
      </div>
    ) : (
      this.props.children
    );
  }
}
function RenderMarker({ selected }: { selected: string }) {
  useFrame(({ gl, camera }) => {
    gl.domElement.dataset.rendered = "true";
    gl.domElement.dataset.scene = "realistic";
    gl.domElement.dataset.selection = selected;
    gl.domElement.dataset.cameraPosition = camera.position
      .toArray()
      .map((n) => n.toFixed(3))
      .join(",");
    gl.domElement.dataset.cameraQuaternion = camera.quaternion
      .toArray()
      .join(",");
    if (camera instanceof THREE.PerspectiveCamera)
      gl.domElement.dataset.cameraFov = String(camera.fov);
  });
  return null;
}

export default function Viewer3D() {
  const {
    project: p,
    activeFloorId,
    selection,
    select,
    revision,
    setError,
    setView,
    presentation,
  } = useProjectStore();
  const [top, setTop] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [labels, setLabels] = useState(true);
  const [ceilingGuide, setCeilingGuide] = useState(true);
  const labelElements = useRef(new Map<string, HTMLButtonElement>());
  const [floorFinish, setFloorFinish] = useState<"oak" | "stone">("oak");
  const [cutWallIds, setCutWallIds] = useState<Set<string>>(new Set());
  const [fitNonce, setFitNonce] = useState(0);
  const [focused, setFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [productTool, setProductTool] = useState<
    "radiator" | "split" | "terminal" | "machine" | null
  >(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [plenumOpen, setPlenumOpen] = useState(false);
  const [plenumSystemId, setPlenumSystemId] = useState("");
  const [channelView, setChannelView] = useState(false);
  const [channelPanel, setChannelPanel] = useState(false);
  const [hydronicPanel, setHydronicPanel] = useState(false);
  const [fanCoilPanel, setFanCoilPanel] = useState(false);
  const [loadMap, setLoadMap] = useState(false);
  const [tour, setTour] = useState(false);
  const [comfortMode, setComfortMode] = useState<ComfortMode | "off">("cool");
  const tourIndex = useRef(0);
  const [transformMode, setTransformMode] = useState<TransformMode | null>(
    null,
  );
  const [preview, setPreview] = useState<Project | null>(null);
  const [dragGuide, setDragGuide] = useState("");
  const onPreview = useCallback((next: Project | null) => setPreview(next), []);
  const sceneProject = preview ?? p;
  const container = useRef<HTMLDivElement>(null);
  const selectedId = selection[0]?.id;
  const chosenDevice =
    p &&
    [
      ...p.radiators,
      ...p.airTerminals,
      ...(p.fanCoils ?? []),
      ...(p.hydronicSystems ?? []).map((s) => ({
        ...s.outdoorUnit,
        roomId: "",
        wallId: null,
        kind: "heatPump",
      })),
      ...p.plenums.map((pl) => ({
        ...pl,
        wallId: null,
        roomId: pl.roomId ?? "",
      })),
      ...(p.pillars ?? []).map((c) => ({
        ...c,
        wallId: null,
        roomId: "",
        kind: "pillar",
      })),
      ...p.hvacSystems.flatMap((s) => s.indoorUnits),
    ].find((d) => d.id === selectedId);
  const selectedRoom = p?.rooms.find(
    (r) => r.id === selectedId || r.id === chosenDevice?.roomId,
  );
  const isolatedRoomId = isolated ? selectedRoom?.id : undefined;
  const rooms = useMemo(
    () =>
      p?.rooms.filter(
        (r) =>
          r.floorId === activeFloorId &&
          (!isolatedRoomId || r.id === isolatedRoomId),
      ) ?? [],
    [p?.rooms, activeFloorId, isolatedRoomId],
  );
  const walls = useMemo(
    () =>
      p?.walls.filter(
        (w) =>
          w.floorId === activeFloorId &&
          (!isolatedRoomId || rooms.some((r) => r.wallIds.includes(w.id))),
      ) ?? [],
    [p?.walls, activeFloorId, isolatedRoomId, rooms],
  );
  const frame = useMemo(() => {
    if (isolatedRoomId && rooms[0]) {
      const box = bounds(rooms[0].polygon);
      const margin = Math.max(0.15, ...walls.map((w) => w.thickness));
      return {
        minX: box.minX - margin,
        maxX: box.maxX + margin,
        minZ: box.minY - margin,
        maxZ: box.maxY + margin,
        height: rooms[0].heightM,
      };
    }
    const frame = sceneFrame(
      walls,
      rooms,
      p?.projectSettings.defaultHeightM ?? 2.7,
    );
    for (const unit of p?.hydronicSystems
      ?.filter((s) => s.outdoorUnit.floorId === activeFloorId)
      .map((s) => s.outdoorUnit) ?? []) {
      const radius = Math.hypot(unit.widthMm, unit.depthMm) / 2000 + 0.3;
      frame.minX = Math.min(frame.minX, unit.position.x - radius);
      frame.maxX = Math.max(frame.maxX, unit.position.x + radius);
      frame.minZ = Math.min(frame.minZ, unit.position.y - radius);
      frame.maxZ = Math.max(frame.maxZ, unit.position.y + radius);
    }
    return frame;
  }, [
    walls,
    rooms,
    isolatedRoomId,
    p?.projectSettings.defaultHeightM,
    p?.hydronicSystems,
    activeFloorId,
  ]);
  const codes = useMemo(
    () => (p ? deviceCodes(p) : new Map<string, string>()),
    [p],
  );
  const focusFrame = useMemo<SceneFrame>(() => {
    if (!focused || !p) return frame;
    if (chosenDevice) {
      let elevation = 0.1 + chosenDevice.heightMm / 2000;
      if ("mounting" in chosenDevice) {
        if (
          chosenDevice.elevationM === null ||
          chosenDevice.mounting === "unknown"
        )
          return frame;
        elevation = Number(chosenDevice.elevationM);
      } else if ("systemId" in chosenDevice) {
        elevation = chosenDevice.elevationM ?? 2;
      } else if (
        "kind" in chosenDevice &&
        chosenDevice.kind === "heatPump" &&
        "elevationM" in chosenDevice
      ) {
        elevation = Number(chosenDevice.elevationM);
      } else if (
        "productId" in chosenDevice &&
        !("elements" in chosenDevice) &&
        selectedRoom
      )
        elevation = splitCenterElevationM(selectedRoom, chosenDevice);
      const radius =
        Math.max(chosenDevice.widthMm, chosenDevice.heightMm) / 2000 + 0.15;
      const halfHeight =
        "mounting" in chosenDevice && chosenDevice.mounting === "ceiling"
          ? 0.12
          : chosenDevice.heightMm / 2000;
      return {
        minX: chosenDevice.position.x - radius,
        maxX: chosenDevice.position.x + radius,
        minZ: chosenDevice.position.y - radius,
        maxZ: chosenDevice.position.y + radius,
        base: Math.max(0, elevation - halfHeight - 0.1),
        height: elevation + halfHeight + 0.1,
      };
    }
    if (selectedRoom)
      return sceneFrame(
        walls.filter((w) => selectedRoom.wallIds.includes(w.id)),
        [selectedRoom],
        selectedRoom.heightM,
      );
    const wall = p.walls.find((w) => w.id === selectedId);
    return wall
      ? sceneFrame(
          [wall],
          rooms.filter((r) => r.wallIds.includes(wall.id)),
          frame.height,
        )
      : frame;
  }, [focused, p, frame, chosenDevice, selectedRoom, walls, rooms, selectedId]);
  useEffect(() => {
    if (!tour || !p) return;
    const targets = [
      ...rooms.map((r) => ({ kind: "room" as const, id: r.id })),
      ...p.plenums
        .filter((pl) => pl.floorId === activeFloorId)
        .map((pl) => ({ kind: "device" as const, id: pl.id })),
    ];
    if (!targets.length) return;
    const advance = () => {
      select(targets[tourIndex.current++ % targets.length]);
      setFocused(true);
      setIsolated(false);
      setTop(false);
    };
    const first = setTimeout(advance, 0);
    const timer = setInterval(advance, 5500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [tour, p, rooms, activeFloorId, select]);
  const selectedPlenum = p?.plenums.find((pl) => pl.id === selectedId);
  const internalSides =
    p && selectedRoom ? roomMeasuredSides(p, selectedRoom, "internal") : null;
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === container.current)
        await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setError(
        "Schermo intero non disponibile nel browser. La vista resta utilizzabile.",
      );
    }
  }
  async function saveRender() {
    if (!p) return;
    setRenderBusy(true);
    try {
      const { renderProjectPanoramas } =
        await import("@/services/render3d/export");
      const images = await renderProjectPanoramas(structuredClone(p), {
        floorId: activeFloorId,
        roomId: isolatedRoomId,
        floorFinish,
      });
      const image = images.at(-1);
      if (!image) throw new Error("Nessun ambiente renderizzabile nel piano.");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${p.name.replace(/[^a-zA-Z0-9àèéìòù _-]/g, "").slice(0, 80) || "progetto"}-render.jpg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Render non generato. Riprovare.",
      );
    } finally {
      setRenderBusy(false);
    }
  }
  const floorName = p?.floors.find((f) => f.id === activeFloorId)?.name ?? "";
  const unknownWindows =
    p?.openings.filter(
      (o) =>
        o.floorId === activeFloorId &&
        o.type === "window" &&
        o.sillHeightM === null,
    ).length ?? 0;
  return (
    <div
      ref={container}
      className={`area-editor vista-3d ${styles.viewer} ${presentation ? styles.presentation : ""}`}
      data-testid="viewer-3d"
    >
      {!walls.length ? (
        <div className={styles.empty}>
          <strong>Il tuo progetto in tre dimensioni</strong>
          <span>
            Disegna i muri o crea una stanza per costruire il modello.
          </span>
          <button className="bottone" onClick={() => setView("2d")}>
            Disegna in 2D
          </button>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.group}>
              <button
                aria-pressed={presentation}
                onClick={() => {
                  useProjectStore.setState({ presentation: !presentation });
                  setProductTool(null);
                  setPlenumOpen(false);
                  setChannelPanel(false);
                  setHydronicPanel(false);
                  setFanCoilPanel(false);
                  setTransformMode(null);
                  if (!presentation && !fullscreen) void toggleFullscreen();
                  if (presentation && fullscreen) void toggleFullscreen();
                  if (presentation) setTour(false);
                }}
              >
                {presentation
                  ? "Torna alla progettazione"
                  : "Presentazione cliente"}
              </button>
              <button
                aria-pressed={channelView}
                onClick={() => {
                  setChannelView(!channelView);
                  setChannelPanel(!channelView && !presentation);
                }}
              >
                Vista Canale
              </button>
              <button
                aria-pressed={loadMap}
                onClick={() => setLoadMap(!loadMap)}
              >
                Mappa fabbisogno
              </button>
              <button
                aria-pressed={tour}
                onClick={() => {
                  tourIndex.current = 0;
                  setTour(!tour);
                  setFocused(!tour);
                }}
              >
                {" "}
                {tour ? "Ferma tour" : "Tour del progetto"}
              </button>
              {presentation && (
                <label className={styles.comfortChoice}>
                  <span>Comfort</span>
                  <select
                    aria-label="Flusso aria e calore"
                    value={comfortMode}
                    onChange={(e) =>
                      setComfortMode(e.target.value as ComfortMode | "off")
                    }
                  >
                    <option value="cool">Aria fresca</option>
                    <option value="heat">Calore</option>
                    <option value="off">Flussi spenti</option>
                  </select>
                </label>
              )}
            </div>
            <div className={`${styles.group} ${styles.editingTools}`}>
              <button
                onClick={() => {
                  setHydronicPanel(!hydronicPanel);
                  setFanCoilPanel(false);
                  setProductTool(null);
                }}
              >
                Pompa di calore
              </button>
              <button
                onClick={() => {
                  setFanCoilPanel(!fanCoilPanel);
                  setHydronicPanel(false);
                  setProductTool(null);
                }}
              >
                Ventilconvettori
              </button>
              <button
                onClick={() => useProjectStore.setState({ pillarDialog: true })}
              >
                Pilastro
              </button>
              <button
                className={top ? styles.active : undefined}
                onClick={() => setTop(!top)}
              >
                {top ? "Vista prospettica" : "Vista dall'alto"}
              </button>
              <button
                onClick={() => {
                  setFocused(false);
                  setFitNonce((n) => n + 1);
                }}
              >
                Adatta vista
              </button>
              <button
                disabled={!selectedId}
                onClick={() => {
                  setFocused(true);
                  setFitNonce((n) => n + 1);
                }}
              >
                Avvicina selezione
              </button>
              <button onClick={toggleFullscreen}>
                {fullscreen ? "Esci da schermo intero" : "Schermo intero"}
              </button>
              <button onClick={saveRender} disabled={renderBusy}>
                <Camera size={16} aria-hidden="true" />
                {renderBusy ? "Generazione render…" : "Salva render"}
              </button>
            </div>
            <div className={`${styles.group} ${styles.editingTools}`}>
              <button
                className={
                  productTool === "radiator" ? styles.active : undefined
                }
                onClick={() => setProductTool("radiator")}
              >
                <Columns size={22} aria-hidden="true" />
                Radiatori
              </button>
              <button
                className={productTool === "split" ? styles.active : undefined}
                onClick={() => setProductTool("split")}
              >
                <Snowflake size={22} aria-hidden="true" />
                Climatizzatori
              </button>
              <button
                className={
                  productTool === "terminal" ? styles.active : undefined
                }
                onClick={() => setProductTool("terminal")}
              >
                <Wind size={22} aria-hidden="true" />
                Bocchette
              </button>
              <button onClick={() => setProductTool("machine")}>
                <Wind size={20} aria-hidden="true" />
                Macchina manuale
              </button>
              <button
                disabled={
                  !p?.hvacSystems.some((system) => system.type === "ducted")
                }
                onClick={() => {
                  setPlenumSystemId(
                    p?.hvacSystems.find(
                      (system) =>
                        system.type === "ducted" &&
                        system.roomIds.includes(selectedRoom?.id ?? ""),
                    )?.id ??
                      p?.hvacSystems.find((system) => system.type === "ducted")
                        ?.id ??
                      "",
                  );
                  setProductTool(null);
                  setPlenumOpen(true);
                }}
              >
                <Wind size={20} aria-hidden="true" />
                Plenum
              </button>
              <details className={styles.settings}>
                <summary>
                  <SlidersHorizontal size={18} aria-hidden="true" />
                  Aspetto
                </summary>
                <div className={styles.settingsBody}>
                  <label>
                    <input
                      type="checkbox"
                      checked={cutaway}
                      onChange={(e) => setCutaway(e.target.checked)}
                    />
                    Muri in sezione
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={isolated}
                      disabled={!selectedRoom}
                      onChange={(e) => {
                        setIsolated(e.target.checked);
                        setFocused(false);
                      }}
                    />
                    Isola selezione
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={labels}
                      onChange={(e) => setLabels(e.target.checked)}
                    />
                    Nomi ambienti
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={ceilingGuide}
                      onChange={(e) => setCeilingGuide(e.target.checked)}
                    />
                    Quota soffitto
                  </label>
                  <select
                    aria-label="Finitura pavimento"
                    value={floorFinish}
                    onChange={(e) =>
                      setFloorFinish(e.target.value as "oak" | "stone")
                    }
                  >
                    <option value="oak">Rovere chiaro</option>
                    <option value="stone">Pietra chiara</option>
                  </select>
                </div>
              </details>
            </div>
          </div>
          {!presentation && chosenDevice && (
            <div className={styles.transformBar}>
              {(["translate", "rotate", "scale"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={transformMode === mode}
                  disabled={
                    chosenDevice.locked ||
                    (mode !== "translate" && "elements" in chosenDevice)
                  }
                  onClick={() =>
                    setTransformMode(transformMode === mode ? null : mode)
                  }
                >
                  {
                    {
                      translate: "Sposta 3D",
                      rotate: "Ruota 3D",
                      scale: "Lunghezza 3D",
                    }[mode]
                  }
                </button>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={useProjectStore.getState().snap.enabled}
                  onChange={(e) =>
                    useProjectStore.setState((s) => ({
                      snap: { ...s.snap, enabled: e.target.checked },
                    }))
                  }
                />
                Snap
              </label>
            </div>
          )}
          {channelPanel && p && !presentation && (
            <aside className={styles.plenumPanel}>
              <header>
                <strong>Canalizzazione collegata</strong>
                <button
                  aria-label="Chiudi canali"
                  onClick={() => setChannelPanel(false)}
                >
                  ×
                </button>
              </header>
              {p.hvacSystems
                .filter((s) => s.type === "ducted")
                .map((s) => (
                  <DuctPanel key={s.id} project={p} systemId={s.id} />
                ))}
            </aside>
          )}
          {channelView && !presentation && !channelPanel && (
            <button
              className={styles.channelConfig}
              onClick={() => setChannelPanel(true)}
            >
              Configura percorsi
            </button>
          )}
          {presentation && p && (
            <div className={styles.clientHeader}>
              <span>TERMOIDRAULICA STAIANO / PROGETTAZIONE 3D</span>
              <h2>{p.name}</h2>
              <p>
                {channelView
                  ? "La distribuzione dell’aria, ambiente per ambiente"
                  : loadMap
                    ? "Il fabbisogno di ogni ambiente"
                    : "Il tuo impianto prende forma"}
              </p>
            </div>
          )}
          <PillarDialog />
          {p && (hydronicPanel || fanCoilPanel) && !presentation && (
            <aside className={styles.plenumPanel}>
              <header>
                <strong>
                  {hydronicPanel
                    ? "Impianto idronico · macchina esterna"
                    : "Ventilconvettori e comandi"}
                </strong>
                <button
                  aria-label="Chiudi impianto idronico"
                  onClick={() => {
                    setHydronicPanel(false);
                    setFanCoilPanel(false);
                  }}
                >
                  ×
                </button>
              </header>
              {hydronicPanel ? (
                <HydronicPanel project={p} floorId={activeFloorId} />
              ) : selectedRoom ? (
                <FanCoilPanel project={p} room={selectedRoom} />
              ) : (
                <p>
                  Seleziona un ambiente nel modello 3D per inserire i
                  ventilconvettori.
                </p>
              )}
            </aside>
          )}
          {productTool && p && (
            <ProductTools
              type={productTool}
              project={p}
              activeFloorId={activeFloorId}
              selectedRoom={selectedRoom}
              selectedWall={p.walls.find((w) => w.id === selectedId)}
              onClose={() => setProductTool(null)}
            />
          )}
          {plenumOpen && p && (
            <div
              className={styles.plenumPanel}
              role="dialog"
              aria-label="Plenum degli impianti autonomi"
            >
              <header>
                <strong>Plenum mandata</strong>
                <button
                  aria-label="Chiudi plenum"
                  onClick={() => setPlenumOpen(false)}
                >
                  ×
                </button>
              </header>
              <label className="campo">
                <span>Impianto autonomo</span>
                <select
                  aria-label="Impianto plenum"
                  value={plenumSystemId}
                  onChange={(e) => setPlenumSystemId(e.target.value)}
                >
                  {p.hvacSystems
                    .filter((system) => system.type === "ducted")
                    .map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name ||
                          p.rooms
                            .filter((room) => system.roomIds.includes(room.id))
                            .map((room) => room.name)
                            .join(", ")}
                      </option>
                    ))}
                </select>
              </label>
              <SupplyPlenumPanel project={p} systemId={plenumSystemId} />
            </div>
          )}
          <div className={styles.scene}>
            <WebGLError>
              <Canvas
                shadows={{ type: THREE.PCFSoftShadowMap }}
                dpr={[1, 1.75]}
                gl={{
                  antialias: true,
                  alpha: true,
                  toneMapping: THREE.ACESFilmicToneMapping,
                  toneMappingExposure: 1.05,
                }}
                camera={{
                  fov: 38,
                  near: 0.02,
                  far: Math.max(
                    2000,
                    (frame.maxX -
                      frame.minX +
                      frame.maxZ -
                      frame.minZ +
                      frame.height) *
                      8,
                  ),
                }}
                frameloop="demand"
                onPointerMissed={() => select(null)}
                fallback={
                  <div className="vuoto">
                    WebGL non disponibile. Usare la vista 2D.
                  </div>
                }
              >
                <SceneLighting
                  frame={frame}
                  revision={revision + (cutaway ? 100000 : 0)}
                />
                <ArchitectureMeshes
                  walls={walls}
                  rooms={rooms}
                  openings={p?.openings ?? []}
                  defaultHeightM={p?.projectSettings.defaultHeightM ?? 2.7}
                  selection={selection}
                  onSelect={select}
                  cutWallIds={
                    cutaway
                      ? new Set(
                          [...cutWallIds].filter(
                            (id) => !focused || id !== chosenDevice?.wallId,
                          ),
                        )
                      : new Set()
                  }
                  floorFinish={floorFinish}
                  isolatedRoom={isolated ? selectedRoom : undefined}
                />
                {sceneProject && (
                  <DeviceMeshes
                    project={sceneProject}
                    activeFloorId={activeFloorId}
                    selection={selection}
                    isolatedRoomId={isolatedRoomId}
                    onSelect={select}
                    showHydronicPipes={channelView}
                  />
                )}
                {sceneProject && channelView && (
                  <DuctMeshes
                    project={sceneProject}
                    activeFloorId={activeFloorId}
                    animated={presentation}
                    flowMode={comfortMode === "heat" ? "heat" : "cool"}
                  />
                )}
                {loadMap && <LoadMap rooms={rooms} />}
                {presentation && sceneProject && comfortMode !== "off" && (
                  <ComfortFlows
                    project={sceneProject}
                    floorId={activeFloorId}
                    mode={comfortMode}
                    roomId={isolatedRoomId}
                  />
                )}
                {p && selectedId && transformMode && !presentation && (
                  <DeviceTransform
                    project={p}
                    id={selectedId}
                    mode={transformMode}
                    onPreview={onPreview}
                    onGuide={setDragGuide}
                  />
                )}
                <RoomLabelProjection rooms={rooms} elements={labelElements} />
                {ceilingGuide &&
                  rooms
                    .filter((room) =>
                      p?.airTerminals.some(
                        (t) =>
                          t.roomId === room.id &&
                          t.mounting === "ceiling" &&
                          !t.legacyUnverified,
                      ),
                    )
                    .map((room) => (
                      <CeilingReference key={room.id} room={room} />
                    ))}
                {chosenDevice &&
                  "mounting" in chosenDevice &&
                  chosenDevice.elevationM !== null && (
                    <Line
                      points={[
                        [
                          chosenDevice.position.x,
                          0.03,
                          chosenDevice.position.y,
                        ],
                        [
                          chosenDevice.position.x,
                          chosenDevice.elevationM,
                          chosenDevice.position.y,
                        ],
                      ]}
                      color="#0b7ea8"
                      transparent
                      opacity={0.35}
                      lineWidth={1}
                      dashed
                      dashSize={0.05}
                      gapSize={0.04}
                    />
                  )}
                <CameraRig
                  frame={focusFrame}
                  top={top}
                  fitKey={`${activeFloorId}|${isolatedRoomId ?? ""}|${fitNonce}`}
                  walls={walls}
                  rooms={rooms}
                  cutaway={cutaway}
                  onCutWalls={setCutWallIds}
                  viewRotation={focused ? chosenDevice?.rotation : undefined}
                  underside={
                    focused &&
                    !!chosenDevice &&
                    "mounting" in chosenDevice &&
                    chosenDevice.mounting === "ceiling"
                  }
                  animate={presentation || tour}
                />
                <RenderMarker selected={selectedId ?? ""} />
                <SceneEffects enabled={walls.length < 150} />
              </Canvas>
            </WebGLError>
            {dragGuide && (
              <output className={styles.dragGuide}>{dragGuide}</output>
            )}
            <div className={styles.sceneLabels}>
              {labels &&
                rooms.map((room) => (
                  <button
                    key={room.id}
                    ref={(el) => {
                      if (el) labelElements.current.set(room.id, el);
                      else labelElements.current.delete(room.id);
                    }}
                    className={styles.roomLabel}
                    aria-label={`Seleziona ${room.name} nel 3D`}
                    aria-pressed={selection.some((s) => s.id === room.id)}
                    onClick={() => select({ kind: "room", id: room.id })}
                  >
                    <strong>{room.name}</strong>
                    <span>
                      {formatNumber(room.netAreaM2)} m² · h{" "}
                      {formatNumber(room.heightM)} m
                      {loadMap &&
                        ` · ${formatNumber(room.designLoadW / 1000)} kW`}
                    </span>
                  </button>
                ))}
            </div>
          </div>
          <div className={styles.bottom}>
            {presentation && p && (
              <div className={styles.clientStats}>
                <strong>
                  {selectedPlenum
                    ? `${codes.get(selectedPlenum.id)} · ${selectedPlenum.model}`
                    : selectedRoom?.name || `${rooms.length} ambienti`}
                </strong>
                {selectedPlenum ? (
                  <p>
                    {sceneProject &&
                      `${sceneProject.ducts?.filter((d) => d.plenumId === selectedPlenum.id && d.terminalId).length ?? 0} rami collegati`}{" "}
                    · plenum esclusivo di {codes.get(selectedPlenum.systemId)}
                  </p>
                ) : (
                  <p>
                    {internalSides
                      ? `${formatNumber(internalSides.width)} × ${formatNumber(internalSides.length)} m interni · `
                      : ""}
                    {formatNumber(
                      selectedRoom?.netAreaM2 ??
                        rooms.reduce((sum, r) => sum + r.netAreaM2, 0),
                    )}{" "}
                    m² utili
                  </p>
                )}
                {loadMap && (
                  <small>
                    Fabbisogno convenzionale volume × 35 W/m³; non una mappa di
                    temperature.
                  </small>
                )}
                {channelView && (
                  <small>
                    Percorsi proposti · flusso illustrativo · verifica esecutiva
                    richiesta
                  </small>
                )}
                {comfortMode !== "off" && (
                  <small>
                    {comfortMode === "heat"
                      ? "Calore e convezione"
                      : "Mandata e ripresa aria"}{" "}
                    · direzioni illustrative, non simulazione fisica
                  </small>
                )}
                {p.hvacSystems
                  .filter((s) => s.type === "ducted")
                  .flatMap((s) =>
                    systemLinearBalances(p, s.id).map((b) => (
                      <small key={`${s.id}-${b.use}`}>
                        {codes.get(s.id)} ·{" "}
                        {b.use === "supply" ? "Mandata" : "Ripresa"}:{" "}
                        {formatNumber(b.installedM)} m installati /{" "}
                        {formatNumber(b.requiredM)} m richiesti
                        {b.status === "deficit"
                          ? " · metratura da completare"
                          : ""}
                      </small>
                    )),
                  )}
              </div>
            )}
            <div className={styles.caption}>
              <strong>
                {chosenDevice
                  ? `${codes.get(chosenDevice.id) ?? ""} · ${"family" in chosenDevice ? chosenDevice.family : "Split"}`
                  : `${floorName} · ${rooms.length} ${rooms.length === 1 ? "ambiente" : "ambienti"}`}
              </strong>
              {chosenDevice
                ? `${formatNumber(chosenDevice.widthMm, 0)} × ${formatNumber(chosenDevice.heightMm, 0)}${chosenDevice.depthMm !== null ? ` × ${formatNumber(chosenDevice.depthMm, 0)}` : " · profondità da verificare"} mm`
                : "Dimensioni di progetto · finiture illustrative · soffitti in sezione"}
              {unknownWindows > 0 && (
                <span>
                  {" "}
                  · {unknownWindows}{" "}
                  {unknownWindows === 1
                    ? "finestra con quota da verificare"
                    : "finestre con quote da verificare"}
                </span>
              )}
            </div>
            <div className={styles.hint}>
              Trascina per orbitare · destro per spostare
              <br />
              Rotella per zoom · clic per selezionare
            </div>
          </div>
        </>
      )}
    </div>
  );
}
