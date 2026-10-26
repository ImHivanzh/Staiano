"use client";
import {
  addTerminalPlenum,
  connectPlenum,
  syncAttachedPlenums,
} from "@/domain/ducted/attached-plenums";
import { addMachinePlenum } from "@/domain/ducted/placement";
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
  ArrowClockwise,
  Camera,
  SlidersHorizontal,
  LinkSimple,
} from "@phosphor-icons/react";
import { rotateDevice90 } from "@/domain/geometry/rotate-device";
import { useProjectStore } from "@/stores/project-store";
import { EquipmentIcon } from "../EquipmentIcon";
import { bounds } from "@/domain/geometry/primitives";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { projectOutdoorUnits } from "@/domain/hydronic/placement";
import { airTerminalFaceWidthMm } from "@/domain/air-terminals/geometry";
import { formatNumber } from "@/utils/format";
import { deviceCodes } from "@/services/export/device-codes";
import { ArchitectureMeshes } from "./ArchitectureMeshes";
import { DeviceMeshes } from "./DeviceMeshes";
import { CameraRig } from "./CameraRig";
import { SceneLighting } from "./SceneLighting";
import { SceneEffects } from "./SceneEffects";
import { RoomLabelProjection } from "./RoomLabels";
import { RoomCeiling3D } from "./RoomCeiling3D";
import { CeilingReference } from "./CeilingReference";
import { ProductTools, type ProductTool } from "./ProductTools";
import { FullscreenDialog } from "../FullscreenDialog";
import { installationLabels } from "@/domain/installations";
import { sceneFrame, type SceneFrame } from "./scene-layout";
import styles from "./Viewer3D.module.css";
import type { Project, Selection } from "@/schemas/project";
import { GraphicalDuctedConfigurator } from "../systems/GraphicalDuctedConfigurator";
import { Properties } from "../properties/Properties";
import { WallOpenings } from "../properties/WallOpenings";
import { connectTerminalOnPlan } from "@/domain/ducted/graphic-installation";
import { connectionSelection } from "./connection-selection";
import { connectFanCoilAirOnPlan } from "@/domain/fan-coils/connect";
import {
  configurationBlock,
  connectDraftOnPlan,
  connectHydronicOnPlan,
} from "@/domain/ducted/plan-connections";
import { DeviceTransform, type TransformMode } from "./DeviceTransform";
import { DuctRouteControls } from "./DuctRouteControls";
import { useWaypointDelete } from "../useWaypointDelete";
import { DuctMeshes } from "./DuctMeshes";
import { DuctPanel } from "@/configurator/systems/DuctPanel";
import {
  addDuctWaypoint,
  ductRoute,
  removeDuctWaypoint,
  setDuctKind,
  type RoutePoint,
} from "@/domain/ducted/routes";
import { LoadMap } from "./LoadMap";
import { PillarDialog } from "@/configurator/PillarDialog";
import { roomMeasuredSides } from "@/domain/geometry/dimensions";
import { systemLinearBalances } from "@/domain/air-terminals/linear-meters";
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
function RenderMarker({
  selected,
  cutWallCount,
  doorCount,
}: {
  selected: string;
  cutWallCount: number;
  doorCount: number;
}) {
  useFrame(({ gl, camera }) => {
    gl.domElement.dataset.rendered = "true";
    gl.domElement.dataset.scene = "realistic";
    gl.domElement.dataset.selection = selected;
    gl.domElement.dataset.cutWalls = String(cutWallCount);
    gl.domElement.dataset.doorCount = String(doorCount);
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

export default function Viewer3D({
  readOnly = false,
  editFlexible = false,
  onCloseFlexible,
}: {
  readOnly?: boolean;
  editFlexible?: boolean;
  onCloseFlexible?: () => void;
}) {
  const {
    project: p,
    activeFloorId,
    selection,
    select,
    commit,
    revision,
    setError,
    setView,
    presentation,
    planPlacementTool,
  } = useProjectStore();
  const [top, setTop] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [cutaway, setCutaway] = useState(true);
  const [labels, setLabels] = useState(true);
  const [ceilingGuide, setCeilingGuide] = useState(true);
  const [interior, setInterior] = useState(false);
  const [suspendedCeiling, setSuspendedCeiling] = useState(true);
  const [ceilingTransparent, setCeilingTransparent] = useState(true);
  const labelElements = useRef(new Map<string, HTMLButtonElement>());
  const floorFinish = p?.floorFinish ?? "oak";
  const [cutWallIds, setCutWallIds] = useState<Set<string>>(new Set());
  const [fitNonce, setFitNonce] = useState(0);
  const [focused, setFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [productTool, setProductTool] = useState<ProductTool | null>(null);
  const [configurationTarget, setConfigurationTarget] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [renderBusy, setRenderBusy] = useState(false);
  // I canali fanno parte del risultato: visibili subito, disattivabili.
  const [channelView, setChannelView] = useState(true);
  const [channelPanel, setChannelPanel] = useState(false);
  const [loadMap, setLoadMap] = useState(false);
  const [tour, setTour] = useState(false);
  const [comfortMode, setComfortMode] = useState<ComfortMode | "off">("cool");
  const tourIndex = useRef(0);
  const [transformChoice, setTransformChoice] = useState<{
    id?: string;
    mode: TransformMode | null;
  } | null>(null);
  const [ductWaypoint, setDuctWaypoint] = useState<{
    ductId: string;
    index: number;
  } | null>(null);
  const [preview, setPreview] = useState<Project | null>(null);
  const [dragGuide, setDragGuide] = useState("");
  const transforming = useRef(false);
  const onPreview = useCallback((next: Project | null) => {
    if (next) transforming.current = true;
    else
      requestAnimationFrame(() => {
        transforming.current = false;
      });
    setPreview(next);
  }, []);
  const sceneProject = preview
    ? syncAttachedPlenums(preview, p ?? undefined)
    : p;
  const container = useRef<HTMLDivElement>(null);
  const selectedId = selection[0]?.id;
  const selectedWall = p?.walls.find((wall) => wall.id === selectedId);
  const configurationRoom = p?.rooms.find(
    (room) => room.floorId === activeFloorId,
  );
  const pickDevice = (target: Selection) => {
    if (!p) return;
    if (transforming.current) return;
    if (editFlexible) {
      return;
    }
    if (planPlacementTool === "plenum" && !readOnly && !presentation) {
      const existing = p.plenums.find((item) => item.id === target.id);
      if (existing) {
        select(target);
        setPropertiesOpen(true);
        return;
      }
      const terminal = p.airTerminals.find((item) => item.id === target.id);
      const existingTerminalPlenum = terminal
        ? p.plenums.find((item) => item.attachmentId === terminal.id)
        : undefined;
      if (existingTerminalPlenum) {
        select({ kind: "device", id: existingTerminalPlenum.id });
        setPropertiesOpen(true);
        return;
      }
      useProjectStore
        .getState()
        .commit((project) =>
          terminal
            ? addTerminalPlenum(project, terminal.id)
            : addMachinePlenum(project, target.id),
        );
      const saved = useProjectStore.getState();
      if (!saved.error) {
        saved.select({ kind: "device", id: saved.project!.plenums.at(-1)!.id });
        setPropertiesOpen(true);
      }
      return;
    }
    if (planPlacementTool === "connect" && !readOnly && !presentation) {
      const pair = connectionSelection(p, selectedId, target.id);
      if (pair) {
        useProjectStore
          .getState()
          .commit((project) =>
            pair.plenumId
              ? connectPlenum(project, pair.plenumId, pair.machineId)
              : pair.fanCoilId
                ? connectFanCoilAirOnPlan(
                    project,
                    pair.terminalId,
                    pair.fanCoilId,
                  )
                : pair.hydronic
                  ? connectHydronicOnPlan(
                      project,
                      pair.terminalId,
                      pair.machineId,
                    )
                  : project.ductedDrafts?.some(
                        (t) =>
                          t.id === pair.terminalId || t.id === pair.systemId,
                      )
                    ? connectDraftOnPlan(
                        project,
                        pair.terminalId,
                        pair.systemId,
                      )
                    : connectTerminalOnPlan(
                        project,
                        pair.terminalId,
                        pair.systemId,
                      ),
          );
        if (!useProjectStore.getState().error) {
          select({ kind: "device", id: pair.machineId });
        }
      } else if (
        p.plenums.some((item) => item.id === target.id) ||
        p.ductedDrafts?.some((item) => item.id === target.id) ||
        p.heatPumpDrafts?.some((item) => item.id === target.id) ||
        p.hydronicSystems?.some((item) => item.outdoorUnit.id === target.id) ||
        p.radiators.some((item) => item.id === target.id) ||
        p.fanCoils?.some((item) => item.id === target.id) ||
        p.airTerminals.some((item) => item.id === target.id) ||
        p.hvacSystems.some(
          (item) =>
            item.type === "ducted" &&
            item.indoorUnits.some((unit) => unit.id === target.id),
        )
      ) {
        select(target);
        setError(null);
      } else setError("Seleziona una macchina e un terminale da collegare.");
      return;
    }
    select(target);
    if (readOnly || presentation) return;
    const blocked = configurationBlock(p, target.id);
    if (blocked) {
      setConfigurationTarget(null);
      setError(blocked);
      return;
    }
    useProjectStore.setState({ planPlacementTool: "select" });
    if (
      p.plenums.some((item) => item.id === target.id) ||
      p.pillars?.some((item) => item.id === target.id)
    )
      setPropertiesOpen(true);
    else
      setConfigurationTarget((previous) => ({
        id: target.id,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
  };
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
      ...p.hvacSystems.flatMap((s) =>
        s.outdoorUnit
          ? [
              {
                ...s.outdoorUnit,
                roomId: "",
                wallId: null,
                kind: "heatPump",
              },
            ]
          : [],
      ),
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
  const selectedOutdoor =
    p?.hydronicSystems?.find((s) => s.outdoorUnit.id === selectedId)
      ?.outdoorUnit ??
    p?.hvacSystems.find((s) => s.outdoorUnit?.id === selectedId)?.outdoorUnit;
  const chosenTerminal = p?.airTerminals.find(
    (terminal) => terminal.id === chosenDevice?.id,
  );
  const outdoorEditable = !!selectedOutdoor && !selectedOutdoor.locked;
  const transformMode =
    transformChoice && transformChoice.id === selectedId
      ? transformChoice.mode
      : outdoorEditable
        ? "translate"
        : null;
  const setTransformMode = (mode: TransformMode | null) =>
    setTransformChoice({ id: selectedId, mode });
  const selectedRoom = p?.rooms.find(
    (r) => r.id === selectedId || r.id === chosenDevice?.roomId,
  );
  const isolatedRoomId = isolated ? selectedRoom?.id : undefined;
  const selectedDuct = p?.ducts?.find((duct) => duct.id === selectedId);
  const selectedDuctWaypoint =
    ductWaypoint && ductWaypoint.ductId === selectedId
      ? ductWaypoint.index
      : null;
  const addDuctBend = useCallback((ductId: string, point?: RoutePoint) => {
    let inserted = -1;
    useProjectStore.getState().commit((current) => {
      const result = addDuctWaypoint(current, ductId, point);
      inserted = result.index;
      return result.project;
    });
    if (inserted >= 0 && !useProjectStore.getState().error)
      setDuctWaypoint({ ductId, index: inserted });
  }, []);
  const removeDuctBend = useCallback(() => {
    if (!selectedDuct || selectedDuctWaypoint === null) return;
    useProjectStore
      .getState()
      .commit((current) =>
        removeDuctWaypoint(current, selectedDuct.id, selectedDuctWaypoint),
      );
    setDuctWaypoint(
      selectedDuctWaypoint > 0
        ? { ductId: selectedDuct.id, index: selectedDuctWaypoint - 1 }
        : null,
    );
  }, [selectedDuct, selectedDuctWaypoint]);
  useWaypointDelete(
    !readOnly && !presentation && selectedDuct && selectedDuctWaypoint !== null
      ? removeDuctBend
      : null,
  );
  const toggleDuctKind = useCallback(() => {
    if (!selectedDuct) return;
    useProjectStore
      .getState()
      .commit((current) =>
        setDuctKind(
          current,
          selectedDuct.id,
          selectedDuct.kind === "flexible" ? "rigid" : "flexible",
        ),
      );
  }, [selectedDuct]);
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
        height: rooms[0].roof?.ridgeHeightM ?? rooms[0].heightM,
      };
    }
    return sceneFrame(
      walls,
      rooms,
      p?.projectSettings.defaultHeightM ?? 2.7,
      p
        ? projectOutdoorUnits(p).filter(
            (unit) => unit.floorId === activeFloorId,
          )
        : [],
    );
  }, [walls, rooms, isolatedRoomId, p, activeFloorId]);
  const codes = useMemo(
    () => (p ? deviceCodes(p) : new Map<string, string>()),
    [p],
  );
  const focusFrame = useMemo<SceneFrame>(() => {
    if (editFlexible && p && selectedDuct) {
      const points = ductRoute(p, selectedDuct);
      if (points.length > 1) {
        const box = bounds(points);
        return {
          minX: box.minX - 0.5,
          maxX: box.maxX + 0.5,
          minZ: box.minY - 0.5,
          maxZ: box.maxY + 0.5,
          base: Math.max(
            0,
            Math.min(...points.map((point) => point.elevationM)) - 0.3,
          ),
          height: Math.max(...points.map((point) => point.elevationM)) + 0.3,
        };
      }
    }
    if (!focused || !p) return frame;
    if (chosenDevice) {
      let elevation = 0.1 + chosenDevice.heightMm / 2000;
      if ("mounting" in chosenDevice && "elevationM" in chosenDevice) {
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
        selectedRoom &&
        sceneProject
      )
        elevation = splitCenterElevationM(
          selectedRoom,
          chosenDevice,
          sceneProject,
        );
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
  }, [
    editFlexible,
    selectedDuct,
    focused,
    p,
    frame,
    chosenDevice,
    selectedRoom,
    sceneProject,
    walls,
    rooms,
    selectedId,
  ]);
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
      className={`area-editor vista-3d ${styles.viewer} ${presentation ? styles.presentation : ""} ${readOnly ? styles.customer : ""}`}
      data-testid="viewer-3d"
    >
      {!walls.length ? (
        <div className={styles.empty}>
          <strong>Il tuo progetto in tre dimensioni</strong>
          <span>
            Disegna i muri o crea una stanza per costruire il modello.
          </span>
          {!readOnly && (
            <button className="bottone" onClick={() => setView("2d")}>
              Disegna in 2D
            </button>
          )}
        </div>
      ) : (
        <>
          {!readOnly && (
            <div className={styles.toolbar}>
              {(p?.installations.length ?? 0) > 0 && (
                <details
                  className={styles.settings}
                  name="viewer-menus"
                  data-testid="installation-overview"
                >
                  <summary>Impianti · {p?.installations.length}</summary>
                  <div className={styles.settingsBody}>
                    <p>
                      Vista complessiva: tutti gli impianti sono visibili
                      insieme.
                    </p>
                    {p?.installations.map((item) => (
                      <p key={item.id}>
                        <strong>
                          {item.name} · {installationLabels[item.type]}
                        </strong>
                        <br />
                        {p.rooms
                          .filter((room) => item.roomIds.includes(room.id))
                          .map((room) => room.name)
                          .join(" · ")}
                      </p>
                    ))}
                  </div>
                </details>
              )}
              <details className={styles.settings} name="viewer-menus">
                <summary>Vista 3D</summary>
                <div className={styles.viewBody}>
                  <div className={`${styles.group} ${styles.modeTools}`}>
                    <button
                      aria-pressed={presentation}
                      onClick={() => {
                        useProjectStore.setState({
                          presentation: !presentation,
                        });
                        setProductTool(null);
                        setChannelPanel(false);
                        setTransformMode(null);
                        if (!presentation && !fullscreen)
                          void toggleFullscreen();
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
                        setChannelPanel(false);
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
                            setComfortMode(
                              e.target.value as ComfortMode | "off",
                            )
                          }
                        >
                          <option value="cool">Aria fresca</option>
                          <option value="heat">Calore</option>
                          <option value="off">Flussi spenti</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div
                    className={`${styles.group} ${styles.editingTools} ${styles.cameraTools}`}
                  >
                    <button
                      className={top ? styles.active : undefined}
                      onClick={() => {
                        setInterior(false);
                        setTop(!top);
                      }}
                    >
                      {top ? "Vista prospettica" : "Vista dall'alto"}
                    </button>
                    <button
                      onClick={() => {
                        setInterior(true);
                        setTop(false);
                        setCutaway(false);
                        setCeilingTransparent(false);
                        setFitNonce((n) => n + 1);
                      }}
                    >
                      Vista interna
                    </button>
                    <button
                      onClick={() => {
                        setInterior(false);
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
                </div>
              </details>
              <details
                className={`${styles.settings} ${styles.editingTools}`}
                name="viewer-menus"
              >
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
                  <label>
                    <input
                      type="checkbox"
                      checked={suspendedCeiling}
                      onChange={(e) => setSuspendedCeiling(e.target.checked)}
                    />
                    Controsoffitto
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={ceilingTransparent}
                      onChange={(e) => setCeilingTransparent(e.target.checked)}
                    />{" "}
                    Tetto e controsoffitto trasparenti
                  </label>
                  <select
                    aria-label="Finitura pavimento"
                    value={floorFinish}
                    onChange={(e) =>
                      commit((project) => ({
                        ...project,
                        floorFinish: e.target.value as "oak" | "stone",
                      }))
                    }
                  >
                    <option value="oak">Rovere chiaro</option>
                    <option value="stone">Pietra chiara</option>
                  </select>
                </div>
              </details>
              {!presentation && (
                <>
                  <button
                    className={
                      planPlacementTool === "connect"
                        ? `bottone ${styles.active}`
                        : "bottone"
                    }
                    aria-pressed={planPlacementTool === "connect"}
                    aria-keyshortcuts="C"
                    title="Collega macchina e bocchetta (C)"
                    onClick={() => {
                      setConfigurationTarget(null);
                      useProjectStore.setState({
                        planPlacementTool:
                          planPlacementTool === "connect"
                            ? "select"
                            : "connect",
                      });
                      setChannelView(true);
                    }}
                  >
                    <LinkSimple size={18} aria-hidden="true" /> Collega
                  </button>
                  {selectedWall && (
                    <button
                      className="bottone piccolo"
                      onClick={() => setWallOpen(true)}
                    >
                      Porte e finestre
                    </button>
                  )}
                  <details className={styles.settings} name="viewer-menus">
                    <summary>Aggiungi apparecchio</summary>
                    <div
                      className={styles.productMenu}
                      onClick={(event) =>
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open")
                      }
                    >
                      <button
                        className={
                          productTool === "radiator" ? styles.active : undefined
                        }
                        onClick={() => setProductTool("radiator")}
                      >
                        <EquipmentIcon type="radiator" />
                        Radiatori
                      </button>
                      <button
                        className={
                          productTool === "split" ? styles.active : undefined
                        }
                        onClick={() => setProductTool("split")}
                      >
                        <EquipmentIcon type="split" />
                        Climatizzatori
                      </button>
                      <button
                        className={
                          productTool === "terminal" ? styles.active : undefined
                        }
                        onClick={() => setProductTool("terminal")}
                      >
                        <EquipmentIcon type="terminal" />
                        Bocchette
                      </button>
                      <button onClick={() => setProductTool("machine")}>
                        <EquipmentIcon type="machine" />
                        Macchina manuale
                      </button>
                      <button
                        onClick={() => {
                          useProjectStore.setState({
                            planPlacementTool: "plenum",
                          });
                          setError(null);
                        }}
                      >
                        <EquipmentIcon type="plenum" />
                        Plenum
                      </button>
                      <button onClick={() => setProductTool("heatPump")}>
                        <EquipmentIcon type="heatPump" />
                        Pompa di calore
                      </button>
                      <button onClick={() => setProductTool("fanCoil")}>
                        <EquipmentIcon type="fanCoil" />
                        Ventilconvettori
                      </button>
                      <button
                        onClick={() =>
                          useProjectStore.setState({ pillarDialog: true })
                        }
                      >
                        <EquipmentIcon type="pillar" />
                        Pilastro
                      </button>
                    </div>
                  </details>
                </>
              )}
            </div>
          )}
          {!readOnly && !presentation && chosenDevice && (
            <div className={styles.transformBar}>
              {(["translate", "rotate", "scale"] as const).map((mode) => (
                <button
                  key={mode}
                  aria-pressed={transformMode === mode}
                  disabled={
                    chosenDevice.locked ||
                    (mode === "scale" && !!selectedOutdoor) ||
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
              <button
                aria-label="Ruota 90°"
                title="Ruota elemento di 90°"
                disabled={chosenDevice.locked}
                onClick={() =>
                  useProjectStore
                    .getState()
                    .commit((p) => rotateDevice90(p, chosenDevice.id))
                }
              >
                <ArrowClockwise size={18} aria-hidden="true" /> Ruota 90°
              </button>
              {selectedOutdoor && (
                <button
                  onClick={() => {
                    setFocused(true);
                    setTop(false);
                    setIsolated(false);
                    setFitNonce((value) => value + 1);
                  }}
                >
                  Vista ventilatore
                </button>
              )}
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
          {!readOnly && !presentation && editFlexible && !selectedDuct && (
            <div
              className={styles.transformBar}
              role="region"
              aria-label="Modifica grafica flessibili"
            >
              <strong>Flessibili</strong>
              <span>
                Clicca un tubo, aggiungi curve e trascina i punti nel modello.
              </span>
              <button type="button" onClick={onCloseFlexible}>
                Termina modifica
              </button>
            </div>
          )}
          {!readOnly && !presentation && selectedDuct && (
            <div
              className={styles.transformBar}
              role="region"
              aria-label="Modifica grafica flessibili"
            >
              <strong>{codes.get(selectedDuct.id) ?? "Canale"}</strong>
              <span>
                {selectedDuct.kind === "flexible" ? "Flessibile" : "Rigido"} ·{" "}
                {selectedDuct.waypoints.length}{" "}
                {selectedDuct.waypoints.length === 1 ? "curva" : "curve"}
              </span>
              <button
                type="button"
                disabled={selectedDuct.locked}
                onClick={() => addDuctBend(selectedDuct.id)}
              >
                Aggiungi curva
              </button>
              <button
                type="button"
                disabled={selectedDuct.locked || selectedDuctWaypoint === null}
                onClick={removeDuctBend}
                title="Rimuovi il punto selezionato (Canc)"
                aria-keyshortcuts="Delete Backspace"
              >
                Rimuovi curva
              </button>
              {!editFlexible && (
                <button
                  type="button"
                  disabled={selectedDuct.locked}
                  onClick={toggleDuctKind}
                >
                  {selectedDuct.kind === "flexible"
                    ? "Rendi rigido"
                    : "Rendi flessibile"}
                </button>
              )}
              <label>
                Doppio clic sul tubo per una curva · trascina i punti
              </label>
              {editFlexible && (
                <button type="button" onClick={onCloseFlexible}>
                  Termina modifica
                </button>
              )}
            </div>
          )}
          {channelPanel && p && !presentation && (
            <FullscreenDialog
              open
              title="Canalizzazione collegata"
              closeLabel="Chiudi canali"
              onClose={() => setChannelPanel(false)}
            >
              <div>
                {p.hvacSystems
                  .filter((s) => s.type === "ducted")
                  .map((s) => (
                    <details key={s.id} className={styles.channelSystem}>
                      <summary>
                        {codes.get(s.id)} ·{" "}
                        {p.ducts?.filter(
                          (duct) => duct.systemId === s.id && duct.terminalId,
                        ).length ?? 0}{" "}
                        rami
                      </summary>
                      <DuctPanel
                        project={p}
                        systemId={s.id}
                        onEdit3D={() => {
                          setChannelPanel(false);
                          setChannelView(true);
                        }}
                      />
                    </details>
                  ))}
              </div>
            </FullscreenDialog>
          )}
          {channelView && !presentation && !channelPanel && !editFlexible && (
            <button
              className={styles.channelConfig}
              onClick={() => setChannelPanel(true)}
            >
              Configura percorsi
            </button>
          )}
          {!readOnly && presentation && p && (
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
          {!readOnly && <PillarDialog />}
          {productTool && p && (
            <ProductTools
              type={productTool}
              onClose={() => setProductTool(null)}
            />
          )}
          {!readOnly && !presentation && planPlacementTool === "connect" && (
            <p className="nota" role="status">
              Collega: clicca macchina e bocchetta, in qualsiasi ordine. Escape
              termina.
            </p>
          )}
          {!readOnly && !presentation && planPlacementTool === "plenum" && (
            <p className="nota" role="status">
              Clicca una bocchetta o una macchina per creare il plenum già
              collegato. Escape annulla.
            </p>
          )}
          {!readOnly &&
            !presentation &&
            p &&
            configurationRoom &&
            configurationTarget &&
            planPlacementTool !== "connect" && (
              <GraphicalDuctedConfigurator
                key={`${configurationTarget.id}-${configurationTarget.nonce}`}
                project={p}
                room={configurationRoom}
                mainPlan
                configurationOnly
              />
            )}
          {!readOnly && !presentation && p && selectedWall && wallOpen && (
            <FullscreenDialog
              open
              title="Porte e finestre nella parete"
              onClose={() => setWallOpen(false)}
            >
              <WallOpenings
                key={selectedWall.id}
                project={p}
                wall={selectedWall}
              />
            </FullscreenDialog>
          )}
          {!readOnly && !presentation && propertiesOpen && (
            <FullscreenDialog
              open
              title="Configura elemento 3D"
              onClose={() => setPropertiesOpen(false)}
            >
              <Properties />
            </FullscreenDialog>
          )}
          <div className={styles.scene}>
            <WebGLError>
              <Canvas
                shadows={{ type: THREE.PCFShadowMap }}
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
                onPointerMissed={() => {
                  if (!transforming.current && !editFlexible) select(null);
                }}
                fallback={
                  <div className="vuoto">
                    WebGL non disponibile. Usare la vista 2D.
                  </div>
                }
              >
                <SceneLighting
                  frame={frame}
                  rooms={rooms}
                  revision={revision + (cutaway ? 100000 : 0)}
                />
                <ArchitectureMeshes
                  walls={walls}
                  rooms={rooms}
                  openings={p?.openings ?? []}
                  defaultHeightM={p?.projectSettings.defaultHeightM ?? 2.7}
                  selection={selection}
                  onSelect={(target) => {
                    if (!transforming.current && !editFlexible) select(target);
                  }}
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
                  technicalVoids={channelView || editFlexible}
                  isolatedRoom={isolated ? selectedRoom : undefined}
                />
                {sceneProject && (
                  <DeviceMeshes
                    project={sceneProject}
                    activeFloorId={activeFloorId}
                    selection={selection}
                    isolatedRoomId={isolatedRoomId}
                    onSelect={pickDevice}
                    showHydronicPipes={channelView}
                    hideDuctedMachines={readOnly || presentation}
                  />
                )}
                {sceneProject &&
                  (channelView || editFlexible || !!selectedDuct) && (
                    <DuctMeshes
                      project={sceneProject}
                      activeFloorId={activeFloorId}
                      animated={presentation || readOnly}
                      editable={!readOnly && !presentation}
                      flowMode={comfortMode === "heat" ? "heat" : "cool"}
                      onAddWaypoint={addDuctBend}
                    />
                  )}
                {p &&
                  (channelView || editFlexible || !!selectedDuct) &&
                  !readOnly &&
                  !presentation &&
                  selectedId && (
                    <DuctRouteControls
                      project={p}
                      id={selectedId}
                      index={selectedDuctWaypoint}
                      onSelect={(index) =>
                        setDuctWaypoint(
                          index === null || !selectedId
                            ? null
                            : { ductId: selectedId, index },
                        )
                      }
                      onPreview={onPreview}
                    />
                  )}
                {loadMap && <LoadMap rooms={rooms} />}
                {(presentation || readOnly) &&
                  sceneProject &&
                  comfortMode !== "off" && (
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
                {p &&
                  rooms.map((room) => (
                    <RoomCeiling3D
                      key={room.id}
                      project={sceneProject ?? p}
                      room={room}
                      transparent={ceilingTransparent && (!presentation || readOnly)}
                      showCeiling={suspendedCeiling}
                    />
                  ))}
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
                  "elevationM" in chosenDevice &&
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
                  sync={
                    p
                      ? {
                          projectId: p.id,
                          floorId: activeFloorId,
                          follow: readOnly,
                        }
                      : undefined
                  }
                  interiorRoom={
                    interior ? (selectedRoom ?? rooms[0]) : undefined
                  }
                  frame={focusFrame}
                  preserveView={editFlexible}
                  top={top}
                  fitKey={`${activeFloorId}|${editFlexible ? "" : (isolatedRoomId ?? "")}|${focused && !editFlexible ? (selectedId ?? "") : ""}|${editFlexible}|${fitNonce}`}
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
                  animate={!readOnly && (presentation || tour)}
                />
                <RenderMarker
                  selected={selectedId ?? ""}
                  cutWallCount={cutaway ? cutWallIds.size : 0}
                  doorCount={
                    p?.openings.filter(
                      (opening) =>
                        opening.type === "door" &&
                        walls.some((wall) => wall.id === opening.wallId),
                    ).length ?? 0
                  }
                />
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
            {!readOnly && presentation && p && (
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
                    · plenum esclusivo di{" "}
                    {codes.get(selectedPlenum.systemId ?? "")}
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
                    Fabbisogno convenzionale volume ×{" "}
                    {p.projectSettings.coefficientWm3.toLocaleString("it-IT")}{" "}
                    W/m³; non una mappa di temperature.
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
                  ? `${codes.get(chosenDevice.id) ?? ""} · ${
                      selectedOutdoor
                        ? "Pompa di calore"
                        : "family" in chosenDevice
                          ? chosenDevice.family
                          : (p?.fanCoils ?? []).some(
                                (unit) => unit.id === chosenDevice.id,
                              )
                            ? "Ventilconvettore"
                            : (p?.hvacSystems ?? []).some(
                                  (system) =>
                                    system.type === "vrv" &&
                                    system.indoorUnits.some(
                                      (unit) => unit.id === chosenDevice.id,
                                    ),
                                )
                              ? "VRV/VRF"
                              : "Split"
                    }`
                  : `${floorName} · ${rooms.length} ${rooms.length === 1 ? "ambiente" : "ambienti"}`}
              </strong>
              {chosenDevice
                ? `${formatNumber(chosenTerminal ? airTerminalFaceWidthMm(chosenTerminal) : chosenDevice.widthMm, 0)} × ${formatNumber(chosenDevice.heightMm, 0)}${chosenDevice.depthMm !== null ? ` × ${formatNumber(chosenDevice.depthMm, 0)}` : " · profondità da verificare"} mm`
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
              WASD per muoverti · Shift per accelerare · Q/E su e giù
              <br />
              Rotella per zoom · clic per selezionare
            </div>
          </div>
        </>
      )}
    </div>
  );
}
