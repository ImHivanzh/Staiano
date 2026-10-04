"use client";
import { Component, useEffect, useMemo, useRef, useState } from "react";
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
  const container = useRef<HTMLDivElement>(null);
  const selectedId = selection[0]?.id;
  const chosenDevice =
    p &&
    [
      ...p.radiators,
      ...p.airTerminals,
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
    return sceneFrame(walls, rooms, p?.projectSettings.defaultHeightM ?? 2.7);
  }, [walls, rooms, isolatedRoomId, p?.projectSettings.defaultHeightM]);
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
        elevation = chosenDevice.elevationM;
      } else if (!("elements" in chosenDevice) && selectedRoom)
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
      className={`area-editor vista-3d ${styles.viewer}`}
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
            <div className={styles.group}>
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
                {p && (
                  <DeviceMeshes
                    project={p}
                    activeFloorId={activeFloorId}
                    selection={selection}
                    isolatedRoomId={isolatedRoomId}
                    onSelect={select}
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
                />
                <RenderMarker selected={selectedId ?? ""} />
                <SceneEffects enabled={walls.length < 150} />
              </Canvas>
            </WebGLError>
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
                    </span>
                  </button>
                ))}
            </div>
          </div>
          <div className={styles.bottom}>
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
