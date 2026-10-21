"use client";
import { connectPlenum, insertPlenum } from "@/domain/ducted/attached-plenums";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Cursor,
  ArrowsOutCardinal,
  LinkSimple,
  ArrowDown,
  ArrowUp,
  DotsThree,
  ArrowClockwise,
  Path as PathIcon,
} from "@phosphor-icons/react";
import type { Point, Project, Room } from "@/schemas/project";
import type { Installation } from "@/domain/installations";
import {
  createInstallation,
  assignInstallationRooms,
} from "@/domain/installations";
import { Editor2D } from "../editor2d/Editor2D";
import { FullscreenDialog } from "../FullscreenDialog";
import { EquipmentIcon } from "../EquipmentIcon";
import { RoomAirTerminals } from "./RoomAirTerminals";
import { NotificationToast } from "../NotificationToast";
import { DuctedMachinePicker } from "./DuctedMachinePicker";
import { DuctPanel } from "./DuctPanel";
import { RadiatorPanel } from "./RadiatorPanel";
import { FanCoilPanel } from "./FanCoilPanel";
import { SplitPanel } from "./SplitPanel";
import { VrvPanel } from "./VrvPanel";
import { HydronicPanel } from "./HydronicPanel";
import {
  placeHeatPumpDraft,
  removeHydronicSystem,
} from "@/domain/hydronic/apply";
import { TerminalCommercialOptions } from "./TerminalCommercialOptions";
import { TerminalEditForm } from "../properties/TerminalEditForm";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import {
  useProjectStore,
  type PlanPlacementTool,
} from "@/stores/project-store";
import { pointInPolygon } from "@/domain/geometry/primitives";
import { indoorRoute } from "@/domain/geometry/indoor-route";
import { nearestFootprintEdge } from "@/domain/geometry/footprint";
import { connectionFootprintEdge } from "@/domain/geometry/footprint";
import { linearRunMembers } from "@/domain/air-terminals/linear-run";
import { ductRoute, setDuctRoute } from "@/domain/ducted/routes";
import { flexibleDuctCurve } from "@/domain/ducted/flexible-curve";
import {
  placeMachineOnPlan,
  configureMachineOnPlan,
  connectTerminalOnPlan,
  moveDuctedDraft,
  placeDuctedDraft,
} from "@/domain/ducted/graphic-installation";
import { terminalAirflowBalance } from "@/domain/air-terminals/airflow-balance";
import {
  configurationBlock,
  connectedRoomIds,
  connectDraftOnPlan,
  connectHydronicOnPlan,
  hydronicTargets,
  hydronicRoomIds,
} from "@/domain/ducted/plan-connections";
import { connectionSelection } from "../viewer3d/connection-selection";
import { connectFanCoilAirOnPlan } from "@/domain/fan-coils/connect";
import { removeSelection } from "@/domain/geometry/selection";
import { rotateDevice90 } from "@/domain/geometry/rotate-device";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import { placeEquipmentDraft } from "@/domain/geometry/equipment-draft";
import { formatNumber } from "@/utils/format";
import styles from "./GraphicalDuctedConfigurator.module.css";

/** Contorno del tratto di canale, largo quanto il canale in pianta. */
function ductSegmentPolygon(start: Point, end: Point, widthM: number) {
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const half = widthM / 2,
    nx = (-dy / length) * half,
    ny = (dx / length) * half;
  return [
    `${start.x + nx},${start.y + ny}`,
    `${end.x + nx},${end.y + ny}`,
    `${end.x - nx},${end.y - ny}`,
    `${start.x - nx},${start.y - ny}`,
  ].join(" ");
}

export function GraphicalDuctedConfigurator({
  project,
  room,
  installation: requestedInstallation,
  mainPlan = false,
  drawingTools,
  configurationOnly = false,
}: {
  project: Project;
  room: Room;
  installation?: Installation;
  mainPlan?: boolean;
  drawingTools?: ReactNode;
  configurationOnly?: boolean;
}) {
  const {
    commit,
    error,
    undo,
    past,
    tool: drawingTool,
    selection: projectSelection,
  } = useProjectStore();
  const activeInstallationId = useProjectStore(
    (state) => state.ductedInstallationId,
  );
  const installation = requestedInstallation ??
    project.installations.find(
      (item) => item.id === activeInstallationId && item.type === "ducted",
    ) ??
    project.installations.find(
      (item) =>
        item.type === "ducted" &&
        project.rooms.some(
          (r) => item.roomIds.includes(r.id) && r.floorId === room.floorId,
        ),
    ) ?? {
      id: "",
      name: "Canalizzato",
      type: "ducted" as const,
      roomIds: project.rooms
        .filter((r) => r.floorId === room.floorId)
        .map((r) => r.id),
    };
  const systems = project.hvacSystems.filter(
    (item) =>
      item.type === "ducted" &&
      (mainPlan
        ? item.indoorUnits.some((unit) => unit.floorId === room.floorId) ||
          item.roomIds.some((id) =>
            project.rooms.some(
              (r) => r.id === id && r.floorId === room.floorId,
            ),
          )
        : item.installationId === installation.id),
  );
  const drafts = (project.ductedDrafts ?? []).filter((item) =>
    mainPlan
      ? item.floorId === room.floorId
      : item.installationId === installation.id,
  );
  const terminals = project.airTerminals.filter(
    (item) =>
      (mainPlan && item.floorId === room.floorId) ||
      item.installationId === installation.id ||
      systems.some(
        (system) => system.id === (item.systemId ?? item.pendingSystemId),
      ) ||
      (!item.installationId &&
        !item.systemId &&
        !item.pendingSystemId &&
        installation.roomIds.includes(item.roomId)),
  );
  const initialId =
    mainPlan && projectSelection[0]?.kind === "device"
      ? projectSelection[0].id
      : null;
  const initialTerminal = terminals.find((item) => item.id === initialId);
  const initialSystem = systems.find(
    (item) =>
      item.indoorUnits.some((unit) => unit.id === initialId) ||
      item.id ===
        (initialTerminal?.systemId ?? initialTerminal?.pendingSystemId),
  );
  const [activeSystemId, setActiveSystemId] = useState(
    initialSystem?.id ?? systems[0]?.id ?? "",
  );
  const system =
    systems.find((item) => item.id === activeSystemId) ?? systems[0];
  const mode = useProjectStore((state) => state.planPlacementTool);
  const setMode = (planPlacementTool: PlanPlacementTool) =>
    useProjectStore.setState({ planPlacementTool });
  const [use, setUse] = useState<"supply" | "return">("supply");
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [hydronicOpen, setHydronicOpen] = useState(false);
  const [equipmentTarget, setEquipmentTarget] = useState<{
    point: Point;
    installation: Installation;
    roomId: string;
    deviceId?: string;
    draftId?: string;
  } | null>(null);
  const equipmentRoom = project.rooms.find(
    (item) => item.id === equipmentTarget?.roomId,
  );
  const equipmentProject =
    equipmentTarget &&
    !project.installations.some(
      (item) => item.id === equipmentTarget.installation.id,
    )
      ? {
          ...project,
          installations: [
            ...project.installations,
            equipmentTarget.installation,
          ],
        }
      : project;
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [machineOpen, setMachineOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [cursor, setCursor] = useState<Point | null>(null);
  // Disegno grafico del canale: bocchetta scelta e punti tracciati in pianta.
  const [ductTarget, setDuctTarget] = useState<string | null>(null);
  const [ductPoints, setDuctPoints] = useState<Point[]>([]);
  const saveTerminalButton = useRef<HTMLButtonElement>(null);
  const saveEquipmentButton = useRef<HTMLButtonElement>(null);
  const selectedDraft = drafts.find((item) => item.id === selectedId);
  const selectedHeatPumpDraft = project.heatPumpDrafts?.find(
    (item) => item.id === selectedId,
  );
  const selectedHydronic = project.hydronicSystems?.find(
    (item) => item.outdoorUnit.id === selectedId,
  );
  const selectedTerminal = terminals.find((item) => item.id === selectedId);
  const selectedEquipmentDraft = project.equipmentDrafts?.find(
    (item) => item.id === selectedId,
  );
  const selectedRadiator = project.radiators.find(
    (item) => item.id === selectedId,
  );
  const selectedFanCoil = project.fanCoils?.find(
    (item) => item.id === selectedId,
  );
  const selectedSplitSystem = project.hvacSystems.find(
    (item) =>
      (item.type === "split" || item.type === "vrv") &&
      item.indoorUnits.some((unit) => unit.id === selectedId),
  );
  const selectedEquipment =
    selectedRadiator ??
    selectedFanCoil ??
    selectedSplitSystem?.indoorUnits.find((item) => item.id === selectedId);
  const selectedMachineSystem = systems.find((item) =>
    item.indoorUnits.some((unit) => unit.id === selectedId),
  );
  const selectedMachine = selectedMachineSystem?.indoorUnits.find(
    (item) => item.id === selectedId,
  );
  const members = selectedTerminal
    ? linearRunMembers(project, selectedTerminal)
    : [];
  const totalLength = members.reduce((sum, item) => sum + item.widthMm, 0);
  const position =
    selectedDraft?.position ??
    (members.length
      ? members.reduce(
          (sum, item) => ({
            x: sum.x + (item.position.x * item.widthMm) / totalLength,
            y: sum.y + (item.position.y * item.widthMm) / totalLength,
          }),
          { x: 0, y: 0 },
        )
      : selectedMachine?.position);
  const selectedRoom = project.rooms.find(
    (item) =>
      item.id ===
      (selectedDraft?.roomId ??
        selectedTerminal?.roomId ??
        selectedMachine?.roomId),
  );
  const pointTerminals = terminals.filter(
    (item) => linearRunMembers(project, item)[0]?.id === item.id,
  );
  const balance = system
    ? terminalAirflowBalance(project, system.id, "supply")
    : null;
  const returnBalance = system
    ? terminalAirflowBalance(project, system.id, "return")
    : null;
  const visibleProject = mainPlan
    ? project
    : {
        ...project,
        hvacSystems: systems,
        airTerminals: terminals,
        ductedDrafts: drafts,
        plenums: project.plenums.filter((item) =>
          systems.some((system) => system.id === item.systemId),
        ),
        ducts: project.ducts?.filter((item) =>
          systems.some((system) => system.id === item.systemId),
        ),
        radiators: [],
        fanCoils: [],
        hydronicSystems: [],
        equipmentDrafts: [],
      };
  // Canali sul piano, disegnati a doppia linea come in officina.
  const planDucts = (project.ducts ?? []).flatMap((duct) => {
    const plenum = project.plenums.find((pl) => pl.id === duct.plenumId);
    if (!plenum || plenum.floorId !== room.floorId) return [];
    const route = ductRoute(project, duct);
    const curve =
      duct.kind === "flexible"
        ? flexibleDuctCurve(route, duct.diameterMm ?? 160)?.curve
        : null;
    const points =
      duct.kind === "flexible"
        ? curve
          ? curve
              .getSpacedPoints(Math.max(24, Math.ceil(curve.getLength() * 30)))
              .map((p) => ({ x: p.x, y: p.z, elevationM: p.y }))
          : []
        : route;
    if (points.length < 2) return [];
    return [
      {
        duct,
        points,
        widthM: (duct.widthMm ?? duct.diameterMm ?? 100) / 1000,
      },
    ];
  });
  const instruction =
    mode === "duct"
      ? ductTarget
        ? `Traccia il canale: ${ductPoints.length} punti. Invio salva, Escape annulla.`
        : "Canale: clicca la bocchetta da servire, poi traccia il percorso in pianta."
      : mode === "heatPump"
        ? "Clicca per inserire la pompa all’esterno. Escape annulla."
        : mode === "radiator" ||
            mode === "fanCoil" ||
            mode === "split" ||
            mode === "vrv"
          ? "Clicca per inserire l’apparecchio. Escape annulla."
          : mode === "machine"
            ? "Clicca per inserire la macchina. Escape annulla."
            : mode === "point"
              ? "Clicca per inserire la bocchetta. Escape annulla."
              : mode === "connect"
                ? selectedTerminal
                  ? "Bocchetta selezionata: clicca la macchina. Escape annulla."
                  : selectedMachine
                    ? "Macchina selezionata: clicca la bocchetta. Escape annulla."
                    : "Seleziona macchina e bocchetta, in qualsiasi ordine. Escape annulla."
                : mode === "move"
                  ? "Trascina l’oggetto nella nuova posizione e rilascia per confermare. Escape termina."
                  : selectedTerminal
                    ? `Bocchetta ${selectedTerminal.family} selezionata. Trascina per spostarla; usa Ruota 90° a soffitto. A parete si orienta spostandola su un’altra parete.`
                    : selectedMachine
                      ? "Macchina selezionata. Clicca per modificarla."
                      : "Seleziona un elemento oppure usa gli strumenti Inserisci e Collega.";
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "m" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !document.querySelector(
          'dialog[open],[role="dialog"][aria-modal="true"]',
        ) &&
        !(
          event.target instanceof HTMLElement &&
          (event.target.matches("input,select,textarea") ||
            event.target.isContentEditable)
        )
      ) {
        event.preventDefault();
        useProjectStore.getState().setTool("select");
        setMode("move");
        setCursor(null);
        setNotice("");
        useProjectStore.getState().setError(null);
        return;
      }
      if (
        event.key.toLowerCase() === "k" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !document.querySelector(
          'dialog[open],[role="dialog"][aria-modal="true"]',
        ) &&
        !(
          event.target instanceof HTMLElement &&
          (event.target.matches("input,select,textarea") ||
            event.target.isContentEditable)
        )
      ) {
        event.preventDefault();
        useProjectStore.getState().setTool("select");
        setMode("duct");
        setDuctTarget(null);
        setDuctPoints([]);
        setCursor(null);
        setNotice("");
        useProjectStore.getState().setError(null);
        return;
      }
      if (event.key !== "Escape" || document.querySelector("dialog[open]"))
        return;
      setMode("select");
      setSelectedId(null);
      setCursor(null);
      setDuctTarget(null);
      setDuctPoints([]);
      setNotice("Operazione annullata.");
      useProjectStore.getState().setError(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  // Invio chiude il disegno del canale e salva il percorso tracciato.
  useEffect(() => {
    if (mode !== "duct") return;
    const save = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      if (
        document.querySelector(
          'dialog[open],[role="dialog"][aria-modal="true"]',
        )
      )
        return;
      if (!ductTarget || !ductPoints.length) return;
      event.preventDefault();
      commit((current) => setDuctRoute(current, ductTarget, ductPoints));
      if (useProjectStore.getState().error) return;
      setNotice(
        "Canale salvato: percorso e sezione compaiono in pianta e in 3D.",
      );
      setMode("select");
      setDuctTarget(null);
      setDuctPoints([]);
      setCursor(null);
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [mode, ductTarget, ductPoints, commit]);
  useEffect(
    () =>
      useProjectStore.subscribe((state, previous) => {
        if (state.tool !== previous.tool && state.tool !== "select") {
          setMode("select");
          setSelectedId(null);
          setCursor(null);
        }
      }),
    [],
  );
  function start(next: typeof mode) {
    useProjectStore.getState().setTool("select");
    if (mainPlan && next !== "move" && next !== "connect")
      useProjectStore.getState().select(null);
    setMode(next !== "select" && next === mode ? "select" : next);
    setNotice("");
    setCursor(null);
    setDuctTarget(null);
    setDuctPoints([]);
    useProjectStore.getState().setError(null);
    if (next !== "move" && next !== "connect") setSelectedId(null);
  }
  function prepareInstallation(current: Project, roomId: string) {
    const next = installation.id
      ? assignInstallationRooms(current, installation.id, "ducted", [roomId])
      : createInstallation(current, "ducted", roomId);
    const id = installation.id || next.installations.at(-1)!.id;
    return { project: next, id };
  }
  function moveDevice(id: string, point: Point) {
    commit((current) =>
      current.ductedDrafts?.some((item) => item.id === id)
        ? moveDuctedDraft(current, id, point)
        : movePlacedDevice(current, id, point, useProjectStore.getState().snap),
    );
    setSelectedId(id);
    if (mainPlan) useProjectStore.getState().select({ kind: "device", id });
    if (!useProjectStore.getState().error) {
      setMode("select");
      setCursor(null);
      setNotice("Posizione aggiornata.");
    }
  }
  function pick(point: Point, deviceId?: string, draftId?: string) {
    useProjectStore.getState().setError(null);
    const clickedSystem = systems.find((item) =>
      item.indoorUnits.some((unit) => unit.id === deviceId),
    );
    const clickedTerminal = terminals.find((item) => item.id === deviceId);
    const clickedDraft = drafts.find((item) => item.id === draftId);
    if (mode === "plenum") {
      const targetRoom = project.rooms.find(
        (r) => r.floorId === room.floorId && pointInPolygon(point, r.polygon),
      );
      if (!targetRoom) {
        setNotice("Inserisci il plenum in una stanza.");
        return;
      }
      commit((p) => insertPlenum(p, targetRoom.id, point));
      const saved = useProjectStore.getState();
      if (!saved.error) {
        const id = saved.project!.plenums.at(-1)!.id;
        saved.select({ kind: "device", id });
        setSelectedId(id);
        setMode("select");
        setNotice(
          "Plenum inserito. Usa Collega con una bocchetta di mandata o una macchina di ripresa.",
        );
      }
      return;
    }
    if (mode === "duct") {
      if (!ductTarget) {
        const target = terminals.find((item) => item.id === deviceId);
        if (!target) {
          setNotice("Clicca la bocchetta da servire, poi traccia il canale.");
          return;
        }
        setDuctTarget(target.id);
        setDuctPoints([]);
        setNotice(
          "Traccia il percorso del canale in pianta. Invio salva, Escape annulla.",
        );
        return;
      }
      setDuctPoints((points) => [...points, point]);
      return;
    }
    if (mode === "connect") {
      const pair = connectionSelection(
        project,
        selectedId ?? undefined,
        draftId ?? deviceId ?? "",
      );
      if (pair) {
        commit((current) =>
          pair.plenumId
            ? connectPlenum(current, pair.plenumId, pair.machineId)
            : pair.fanCoilId
              ? connectFanCoilAirOnPlan(
                  current,
                  pair.terminalId,
                  pair.fanCoilId,
                )
              : pair.hydronic
                ? connectHydronicOnPlan(
                    current,
                    pair.terminalId,
                    pair.machineId,
                  )
                : current.ductedDrafts?.some(
                      (t) => t.id === pair.terminalId || t.id === pair.systemId,
                    )
                  ? connectDraftOnPlan(current, pair.terminalId, pair.systemId)
                  : connectTerminalOnPlan(
                      current,
                      pair.terminalId,
                      pair.systemId,
                    ),
        );
        if (!useProjectStore.getState().error) {
          setSelectedId(pair.machineId);
          setNotice(
            "Collegamento salvato. Collega altri terminali, poi configura la macchina. Escape termina.",
          );
        }
        return;
      }
      if (deviceId || draftId) {
        setSelectedId(draftId ?? deviceId!);
        setNotice("");
      } else setNotice("Seleziona una macchina e un terminale.");
      return;
    }
    if (mode === "move") {
      if (deviceId || draftId) {
        setSelectedId(draftId ?? deviceId!);
        if (mainPlan)
          useProjectStore
            .getState()
            .select({ kind: "device", id: draftId ?? deviceId! });
      }
      return;
    }
    if (mode === "heatPump") {
      commit((current) => placeHeatPumpDraft(current, room.floorId, point));
      if (!useProjectStore.getState().error) {
        const draft = useProjectStore
          .getState()
          .project!.heatPumpDrafts!.at(-1)!;
        setSelectedId(draft.id);
        if (mainPlan)
          useProjectStore.getState().select({ kind: "device", id: draft.id });
        setMode("select");
        setCursor(null);
        setNotice("Elemento salvato. Cliccalo per configurarlo.");
      }
      return;
    }
    if (mode === "select") {
      const equipmentDraft = project.equipmentDrafts?.find(
        (item) => item.id === draftId,
      );
      const radiator = project.radiators.find((item) => item.id === deviceId);
      const fanCoil = project.fanCoils?.find((item) => item.id === deviceId);
      const splitSystem = project.hvacSystems.find(
        (item) =>
          (item.type === "split" || item.type === "vrv") &&
          item.indoorUnits.some((unit) => unit.id === deviceId),
      );
      const device =
        radiator ??
        fanCoil ??
        splitSystem?.indoorUnits.find((item) => item.id === deviceId);
      if (equipmentDraft || device) {
        const type =
          equipmentDraft?.type ??
          (radiator
            ? "radiator"
            : fanCoil
              ? "fanCoil"
              : splitSystem?.type === "vrv"
                ? "vrv"
                : "split");
        const roomId = equipmentDraft?.roomId ?? device!.roomId;
        const existingInstallationId =
          radiator?.installationId ??
          fanCoil?.installationId ??
          splitSystem?.installationId;
        const existingInstallation = project.installations.find(
          (item) => item.id === existingInstallationId,
        );
        const installation =
          existingInstallation ??
          createInstallation(project, type, roomId).installations.at(-1)!;
        setSelectedId(draftId ?? deviceId!);
        if (mainPlan)
          useProjectStore
            .getState()
            .select({ kind: "device", id: draftId ?? deviceId! });
        setEquipmentTarget({
          point: equipmentDraft?.position ?? device!.position,
          installation,
          roomId,
          deviceId,
          draftId,
        });
        return;
      }
      if (
        project.heatPumpDrafts?.some((item) => item.id === draftId) ||
        project.hydronicSystems?.some(
          (item) => item.outdoorUnit.id === deviceId,
        )
      ) {
        setSelectedId(draftId ?? deviceId!);
        if (mainPlan)
          useProjectStore
            .getState()
            .select({ kind: "device", id: draftId ?? deviceId! });
        const blocked = configurationBlock(project, draftId ?? deviceId!);
        if (blocked) {
          setNotice("");
          useProjectStore.getState().setError(blocked);
          return;
        }
        setHydronicOpen(true);
        return;
      }
      if (mainPlan && !clickedSystem && !clickedTerminal && !clickedDraft) {
        setSelectedId(deviceId ?? null);
        if (deviceId)
          useProjectStore.getState().select({ kind: "device", id: deviceId });
        return;
      }
      setSelectedId(draftId ?? deviceId ?? null);
      if (clickedSystem || clickedDraft?.kind === "machine") {
        if (mainPlan)
          useProjectStore
            .getState()
            .select({ kind: "device", id: deviceId ?? clickedDraft!.id });
        if (clickedSystem) {
          setActiveSystemId(clickedSystem.id);
          if (mainPlan && clickedSystem.installationId)
            useProjectStore.setState({
              ductedInstallationId: clickedSystem.installationId,
            });
        }
        const blocked = configurationBlock(
          project,
          clickedDraft?.id ?? deviceId!,
        );
        if (blocked) {
          setNotice("");
          useProjectStore.getState().setError(blocked);
          return;
        }
        setMachineOpen(true);
      } else if (clickedTerminal || clickedDraft?.kind === "terminal") {
        if (mainPlan)
          useProjectStore
            .getState()
            .select({ kind: "device", id: deviceId ?? clickedDraft!.id });
        const owner = systems.find(
          (item) =>
            item.id ===
            (clickedTerminal?.systemId ?? clickedTerminal?.pendingSystemId),
        );
        if (owner) setActiveSystemId(owner.id);
        const ownerInstallationId =
          clickedTerminal?.installationId ?? owner?.installationId;
        if (mainPlan && ownerInstallationId)
          useProjectStore.setState({
            ductedInstallationId: ownerInstallationId,
          });
        const blocked = configurationBlock(
          project,
          clickedDraft?.id ?? deviceId!,
        );
        if (blocked) {
          setNotice("");
          useProjectStore.getState().setError(blocked);
          return;
        }
        setTerminalOpen(true);
      } else if (mainPlan && deviceId)
        useProjectStore.getState().select({ kind: "device", id: deviceId });
      return;
    }
    const targetRoom = project.rooms.find(
      (item) =>
        item.floorId === room.floorId &&
        (mainPlan || installation.roomIds.includes(item.id)) &&
        !item.conditioningExclusion &&
        pointInPolygon(point, item.polygon),
    );
    if (!targetRoom) {
      setNotice("Scegli un punto dentro un ambiente di questo impianto.");
      return;
    }
    if (
      mode === "radiator" ||
      mode === "fanCoil" ||
      mode === "split" ||
      mode === "vrv"
    ) {
      if (
        targetRoom.geometryStatus !== "closed" ||
        !project.floors.find((item) => item.id === targetRoom.floorId)
          ?.scaleVerified
      ) {
        setNotice(
          "Chiudi l’ambiente e verifica la scala prima di inserire apparecchi.",
        );
        return;
      }
      commit((current) =>
        placeEquipmentDraft(current, targetRoom.id, point, mode),
      );
      if (!useProjectStore.getState().error) {
        const draft = useProjectStore
          .getState()
          .project!.equipmentDrafts!.at(-1)!;
        setSelectedId(draft.id);
        if (mainPlan)
          useProjectStore.getState().select({ kind: "device", id: draft.id });
        setMode("select");
        setCursor(null);
        setNotice("Elemento salvato. Cliccalo per configurarlo.");
      }
      return;
    }
    let placedId = selectedId;
    if (mode === "machine") {
      const unplaced = systems.find(
        (item) =>
          !item.indoorUnits.length &&
          item.roomIds.includes(targetRoom.id) &&
          item.installationId === installation.id,
      );
      if (unplaced) {
        commit((current) =>
          placeMachineOnPlan(current, unplaced.id, targetRoom.id, point),
        );
        if (!useProjectStore.getState().error) {
          placedId = useProjectStore
            .getState()
            .project!.hvacSystems.find((item) => item.id === unplaced.id)!
            .indoorUnits[0].id;
          setSelectedId(placedId);
        }
      } else {
        commit((current) => {
          const next = createInstallation(current, "ducted", targetRoom.id);
          const prepared = { project: next, id: next.installations.at(-1)!.id };
          return placeDuctedDraft(
            prepared.project,
            prepared.id,
            targetRoom.id,
            point,
            "machine",
          );
        });
        if (!useProjectStore.getState().error) {
          placedId = useProjectStore
            .getState()
            .project!.ductedDrafts!.at(-1)!.id;
          setSelectedId(placedId);
        }
      }
    } else {
      commit((current) => {
        const prepared = prepareInstallation(current, targetRoom.id);
        return placeDuctedDraft(
          prepared.project,
          prepared.id,
          targetRoom.id,
          point,
          "terminal",
          use,
        );
      });
      if (!useProjectStore.getState().error) {
        placedId = useProjectStore.getState().project!.ductedDrafts!.at(-1)!.id;
        setSelectedId(placedId);
      }
    }
    if (!useProjectStore.getState().error) {
      if (mainPlan && placedId)
        useProjectStore.getState().select({ kind: "device", id: placedId });
      setMode("select");
      setCursor(null);
      setNotice("Elemento salvato. Cliccalo per configurarlo.");
      if (
        mainPlan &&
        (useProjectStore.getState().project!.ductedDrafts?.length ?? 0) >
          (project.ductedDrafts?.length ?? 0)
      ) {
        const draft = useProjectStore.getState().project!.ductedDrafts?.at(-1);
        if (draft)
          useProjectStore.setState({
            ductedInstallationId: draft.installationId,
          });
      }
    }
  }
  function deleteSelected() {
    if (
      !window.confirm("Eliminare l’elemento selezionato e i suoi collegamenti?")
    )
      return;
    commit((current) => {
      if (selectedEquipmentDraft)
        return {
          ...current,
          equipmentDrafts: current.equipmentDrafts?.filter(
            (item) => item.id !== selectedId,
          ),
        };
      if (selectedHeatPumpDraft)
        return {
          ...current,
          heatPumpDrafts: current.heatPumpDrafts?.filter(
            (item) => item.id !== selectedId,
          ),
        };
      if (selectedHydronic)
        return removeHydronicSystem(current, selectedHydronic.id);
      if (selectedEquipment)
        return removeSelection(current, [
          { kind: "device", id: selectedEquipment.id },
        ]);
      if (selectedDraft)
        return {
          ...current,
          ductedDrafts: current.ductedDrafts
            ?.filter((item) => item.id !== selectedId)
            .map((item) =>
              item.machineId === selectedId
                ? { ...item, machineId: undefined }
                : item,
            ),
        };
      let next = current;
      if (selectedMachineSystem) {
        for (const terminal of pointTerminals.filter(
          (item) => item.systemId === selectedMachineSystem.id,
        ))
          next = connectTerminalOnPlan(next, terminal.id, null);
        return {
          ...next,
          hvacSystems: next.hvacSystems.filter(
            (item) => item.id !== selectedMachineSystem.id,
          ),
          airTerminals: next.airTerminals.map((item) =>
            item.pendingSystemId === selectedMachineSystem.id
              ? { ...item, pendingSystemId: undefined }
              : item,
          ),
          plenums: next.plenums.filter(
            (item) => item.systemId !== selectedMachineSystem.id,
          ),
          ducts: next.ducts?.filter(
            (item) => item.systemId !== selectedMachineSystem.id,
          ),
        };
      }
      return removeSelection(
        next,
        members.map((item) => ({ kind: "device", id: item.id })),
      );
    });
    if (!useProjectStore.getState().error) {
      setSelectedId(null);
      setTerminalOpen(false);
    }
    if (mainPlan && !useProjectStore.getState().error)
      useProjectStore.getState().select(null);
  }
  const previewDevice =
    selectedTerminal ??
    selectedMachine ??
    selectedEquipment ??
    selectedDraft ??
    selectedHeatPumpDraft ??
    selectedHydronic?.outdoorUnit;
  const previewOrigin =
    mode === "connect" && previewDevice && cursor
      ? connectionFootprintEdge(previewDevice, cursor)
      : null;
  const initialConfiguration = useRef(() => {
    if (!configurationOnly || !initialId) return;
    const draft = [
      ...(project.ductedDrafts ?? []),
      ...(project.equipmentDrafts ?? []),
      ...(project.heatPumpDrafts ?? []),
    ].find((item) => item.id === initialId);
    const device = [
      ...project.radiators,
      ...(project.fanCoils ?? []),
      ...project.airTerminals,
      ...project.hvacSystems.flatMap((system) => system.indoorUnits),
      ...(project.hydronicSystems ?? []).map((system) => system.outdoorUnit),
    ].find((item) => item.id === initialId);
    if (draft || device)
      pick((draft ?? device)!.position, device?.id, draft?.id);
  });
  useEffect(() => initialConfiguration.current(), []);
  const previewRoute =
    previewOrigin && cursor
      ? indoorRoute(project, room.floorId, previewOrigin, cursor)
      : [];
  return (
    <section
      className={`${styles.operating} ${mainPlan ? styles.mainPlan : ""}`}
      style={configurationOnly ? { display: "contents" } : undefined}
      aria-label="Configurazione grafica canalizzato"
    >
      {!configurationOnly && (
        <>
          <div
            className={styles.toolbar}
            role="toolbar"
            aria-label="Strumenti della planimetria"
          >
            <button
              className={`bottone ${styles.iconButton}`}
              aria-label="Seleziona"
              title="Seleziona e configura (Spazio)"
              aria-keyshortcuts="Space"
              aria-pressed={mode === "select" && drawingTool === "select"}
              onClick={() => start("select")}
            >
              <Cursor size={20} aria-hidden="true" />
            </button>
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Muovi (M)"
              title="Muovi (M)"
              aria-keyshortcuts="M"
              aria-pressed={mode === "move"}
              onClick={() => start("move")}
            >
              <ArrowsOutCardinal size={20} aria-hidden="true" />
            </button>
            {drawingTools}
            <span className={styles.toolSeparator} aria-hidden="true" />
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Macchina"
              title="Inserisci macchina canalizzata"
              aria-pressed={mode === "machine"}
              onClick={() => start("machine")}
            >
              <EquipmentIcon type="machine" />
            </button>
            {mainPlan &&
              (
                [
                  ["radiator", "Radiatore"],
                  ["fanCoil", "Ventilconvettore"],
                  ["split", "Split"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  className={`bottone chiara ${styles.iconButton}`}
                  aria-label={label}
                  title={`Inserisci ${label.toLowerCase()}${type === "radiator" ? "" : type === "fanCoil" ? " (V)" : " (S)"}`}
                  aria-keyshortcuts={
                    type === "radiator"
                      ? undefined
                      : type === "fanCoil"
                        ? "V"
                        : "S"
                  }
                  aria-pressed={mode === type}
                  onClick={() => start(type)}
                >
                  <EquipmentIcon type={type} />
                </button>
              ))}
            {mainPlan && (
              <button
                className={`bottone chiara ${styles.iconButton}`}
                aria-label="VRV/VRF"
                title="Inserisci VRV/VRF (N)"
                aria-keyshortcuts="N"
                aria-pressed={mode === "vrv"}
                onClick={() => start("vrv")}
              >
                <EquipmentIcon type="vrv" />
              </button>
            )}
            {mainPlan && (
              <button
                className={`bottone chiara ${styles.iconButton}`}
                aria-label="Pompa di calore"
                title="Inserisci pompa di calore (P)"
                aria-keyshortcuts="P"
                aria-pressed={mode === "heatPump"}
                onClick={() => start("heatPump")}
              >
                <EquipmentIcon type="heatPump" />
              </button>
            )}
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Plenum"
              title="Inserisci plenum"
              aria-pressed={mode === "plenum"}
              onClick={() => start("plenum")}
            >
              <EquipmentIcon type="plenum" />
            </button>
            <span className={styles.toolSeparator} aria-hidden="true" />
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Bocchetta"
              title="Inserisci bocchetta (B)"
              aria-keyshortcuts="B"
              aria-pressed={mode === "point"}
              onClick={() => start("point")}
            >
              <EquipmentIcon type="terminal" />
            </button>
            <div
              className={styles.terminalUse}
              role="group"
              aria-label="Funzione bocchetta"
            >
              <button
                type="button"
                className={`bottone piccolo ${styles.iconButton}`}
                aria-label="Mandata"
                title="Mandata · immissione aria"
                aria-pressed={use === "supply"}
                onClick={() => setUse("supply")}
              >
                <ArrowDown size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`bottone piccolo ${styles.iconButton}`}
                aria-label="Ripresa"
                title="Ripresa · aspirazione aria"
                aria-pressed={use === "return"}
                onClick={() => setUse("return")}
              >
                <ArrowUp size={20} aria-hidden="true" />
              </button>
            </div>
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Collega"
              title="Collega macchina e bocchetta (C)"
              aria-keyshortcuts="C"
              aria-pressed={mode === "connect"}
              onClick={() => start("connect")}
            >
              <LinkSimple size={20} aria-hidden="true" />
            </button>
            <button
              className={`bottone chiara ${styles.iconButton}`}
              aria-label="Canale"
              title="Disegna il canale della bocchetta (K)"
              aria-keyshortcuts="K"
              aria-pressed={mode === "duct"}
              onClick={() => start("duct")}
            >
              <PathIcon size={20} aria-hidden="true" />
            </button>
            {selectedId && (
              <button
                className={`bottone ${styles.iconButton}`}
                aria-label="Ruota 90°"
                title="Ruota elemento di 90°"
                onClick={() => commit((p) => rotateDevice90(p, selectedId))}
              >
                <ArrowClockwise size={22} aria-hidden="true" />
              </button>
            )}
            {(selectedEquipmentDraft ||
              selectedEquipment ||
              selectedDraft ||
              selectedMachine ||
              selectedTerminal ||
              selectedHeatPumpDraft ||
              selectedHydronic) && (
              <details className={styles.moreActions}>
                <summary
                  className={styles.iconSummary}
                  aria-label={
                    selectedEquipmentDraft || selectedEquipment
                      ? "Azioni apparecchio"
                      : selectedHeatPumpDraft || selectedHydronic
                        ? "Azioni pompa di calore"
                        : selectedTerminal
                          ? "Azioni bocchetta"
                          : selectedMachine
                            ? "Azioni macchina"
                            : "Azioni elemento"
                  }
                  title={
                    selectedEquipmentDraft || selectedEquipment
                      ? "Azioni apparecchio"
                      : selectedHeatPumpDraft || selectedHydronic
                        ? "Azioni pompa di calore"
                        : selectedTerminal
                          ? "Azioni bocchetta"
                          : selectedMachine
                            ? "Azioni macchina"
                            : "Azioni elemento"
                  }
                >
                  <DotsThree size={22} aria-hidden="true" />
                </summary>
                <div className={styles.actionMenu}>
                  {selectedTerminal?.systemId && (
                    <button
                      className="bottone"
                      onClick={() =>
                        commit((current) =>
                          connectTerminalOnPlan(
                            current,
                            selectedTerminal.id,
                            null,
                          ),
                        )
                      }
                    >
                      Scollega
                    </button>
                  )}
                  <button className="bottone pericolo" onClick={deleteSelected}>
                    Elimina
                  </button>
                  <button
                    className="bottone"
                    disabled={!past.length}
                    onClick={undo}
                  >
                    Annulla ultima modifica
                  </button>
                </div>
              </details>
            )}
            {!selectedDraft &&
              !selectedEquipmentDraft &&
              !selectedEquipment &&
              !selectedMachine &&
              !selectedTerminal &&
              !selectedHeatPumpDraft &&
              !selectedHydronic && (
                <details className={styles.moreActions}>
                  <summary
                    className={styles.iconSummary}
                    aria-label="Altre azioni"
                    title="Altre azioni"
                  >
                    <DotsThree size={22} aria-hidden="true" />
                  </summary>
                  <div className={styles.actionMenu}>
                    <button
                      className="bottone"
                      disabled={!past.length}
                      onClick={undo}
                    >
                      Annulla ultima modifica
                    </button>
                  </div>
                </details>
              )}
          </div>
          {system && balance && returnBalance && (
            <div className={styles.balance} role="status">
              {systems.length === 1 && (
                <strong>
                  {system.genericMachine?.model ??
                    system.name ??
                    system.manufacturer}{" "}
                  ·{" "}
                </strong>
              )}
              {systems.length > 1 && (
                <label className="campo">
                  <span>Bilancio</span>
                  <select
                    aria-label="Bilancio della macchina"
                    value={system.id}
                    onChange={(event) => setActiveSystemId(event.target.value)}
                  >
                    {systems.map((item, index) => (
                      <option key={item.id} value={item.id}>
                        Macchina {index + 1} ·{" "}
                        {item.genericMachine?.model ?? item.productId} ·{" "}
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              Mandata:{" "}
              <strong>
                {formatNumber(balance.installed, 0)} /{" "}
                {formatNumber(balance.required, 0)} m³/h
              </strong>{" "}
              · Mancano{" "}
              <strong>{formatNumber(balance.remaining, 0)} m³/h</strong>.
              Ripresa: mancano {formatNumber(returnBalance.remaining, 0)} m³/h.
            </div>
          )}
          <p
            className={styles.status}
            hidden={mainPlan && drawingTool !== "select"}
          >
            {instruction}
          </p>
          {notice && !error && (
            <NotificationToast message={notice} tone="info" />
          )}
          {drafts.length > 0 && (
            <p className="nota">
              {drafts.length} elementi da configurare, salvati nel progetto.
              Esclusi da calcoli e computi.
            </p>
          )}
          <div className={styles.canvas}>
            <Editor2D
              configuration={{
                project: visibleProject,
                floorId: room.floorId,
                allowDrawing: mainPlan,
                captureAll: mode !== "select",
                dragDevices: mode === "move",
                onMoveDevice: moveDevice,
                deviceIds: [
                  ...project.plenums.map((item) => item.id),
                  ...project.radiators.map((item) => item.id),
                  ...(project.fanCoils ?? []).map((item) => item.id),
                  ...project.hvacSystems
                    .filter(
                      (item) => item.type === "split" || item.type === "vrv",
                    )
                    .flatMap((item) => item.indoorUnits.map((unit) => unit.id)),
                  ...(project.hydronicSystems ?? []).map(
                    (item) => item.outdoorUnit.id,
                  ),
                  ...terminals.map((item) => item.id),
                  ...systems.flatMap((item) =>
                    item.indoorUnits.map((unit) => unit.id),
                  ),
                ],
                instruction:
                  mainPlan && drawingTool !== "select" ? undefined : "",
                selectedDeviceIds: selectedTerminal
                  ? members.map((item) => item.id)
                  : selectedId
                    ? [selectedId]
                    : [],
                onPick: pick,
                onHover: (point) => {
                  if (mode !== "select") setCursor(point);
                },
                backgroundOverlay: (
                  <>
                    {planDucts.map(({ duct, points, widthM }) => (
                      <g
                        key={duct.id}
                        data-testid="duct-2d"
                        pointerEvents="none"
                        aria-hidden="true"
                      >
                        {duct.kind === "flexible" ? (
                          <>
                            <polyline
                              points={points
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="none"
                              stroke="#243238"
                              strokeWidth={widthM + 0.025}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <polyline
                              points={points
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="none"
                              stroke="#eef3f6"
                              strokeWidth={widthM}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </>
                        ) : (
                          points.slice(1).map((end, index) => {
                            const polygon = ductSegmentPolygon(
                              points[index],
                              end,
                              widthM,
                            );
                            return polygon ? (
                              <polygon
                                key={index}
                                points={polygon}
                                fill="#eef3f6"
                                stroke="#243238"
                                strokeWidth={0.02}
                                strokeLinejoin="round"
                              />
                            ) : null;
                          })
                        )}
                        {duct.kind !== "flexible" &&
                          points
                            .slice(1)
                            .map((end, index) => (
                              <circle
                                key={`joint-${index}`}
                                cx={end.x}
                                cy={end.y}
                                r={widthM / 2}
                                fill="#eef3f6"
                                stroke="#243238"
                                strokeWidth={0.02}
                              />
                            ))}
                        {duct.diameterMm ? (
                          <circle
                            cx={points.at(-1)!.x}
                            cy={points.at(-1)!.y}
                            r={duct.diameterMm / 2000}
                            fill="#ffffff"
                            stroke="#243238"
                            strokeWidth={0.02}
                          />
                        ) : null}
                      </g>
                    ))}
                    {mode === "duct" && ductTarget && (
                      <g data-testid="duct-preview" pointerEvents="none">
                        <polyline
                          points={[...ductPoints, ...(cursor ? [cursor] : [])]
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="var(--tinta)"
                          strokeWidth={0.03}
                          strokeDasharray="0.08 0.06"
                        />
                        {ductPoints.map((point, index) => (
                          <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r={0.05}
                            fill="var(--tinta)"
                          />
                        ))}
                      </g>
                    )}
                    {pointTerminals
                      .filter((item) => item.systemId)
                      .map((terminal) => {
                        const machine = systems.find(
                          (item) => item.id === terminal.systemId,
                        )?.indoorUnits[0];
                        if (!machine) return null;
                        const route = indoorRoute(
                          project,
                          room.floorId,
                          nearestFootprintEdge(machine, terminal.position),
                          connectionFootprintEdge(terminal, machine.position),
                        );
                        return (
                          <g
                            key={terminal.id}
                            data-testid="air-connection"
                            pointerEvents="none"
                          >
                            <polyline
                              points={route
                                .map((p) => `${p.x},${p.y}`)
                                .join(" ")}
                              fill="none"
                              stroke="var(--tinta)"
                              strokeWidth={0.025}
                              strokeDasharray="0.09 0.05"
                            />
                          </g>
                        );
                      })}
                  </>
                ),
                overlay: (
                  <>
                    {cursor &&
                      [
                        "machine",
                        "point",
                        "radiator",
                        "fanCoil",
                        "split",
                        "vrv",
                        "heatPump",
                      ].includes(mode) && (
                        <g
                          data-testid="insertion-preview"
                          pointerEvents="none"
                          opacity={0.7}
                        >
                          <rect
                            x={cursor.x - (mode !== "point" ? 0.4 : 0.25)}
                            y={cursor.y - 0.12}
                            width={mode !== "point" ? 0.8 : 0.5}
                            height={0.24}
                            fill="var(--ambra-tenue)"
                            stroke="var(--ambra)"
                            strokeWidth={0.03}
                            strokeDasharray="0.06 0.04"
                          />
                          <text
                            x={cursor.x}
                            y={cursor.y - 0.2}
                            fontSize={0.14}
                            textAnchor="middle"
                            fill="var(--ambra)"
                          >
                            Da configurare
                          </text>
                        </g>
                      )}
                    {cursor && previewOrigin && (
                      <polyline
                        data-testid="connection-preview"
                        points={(previewRoute.length
                          ? previewRoute
                          : [previewOrigin, cursor]
                        )
                          .map((p) => `${p.x},${p.y}`)
                          .join(" ")}
                        fill="none"
                        stroke={
                          previewRoute.length ? "var(--tinta)" : "var(--rosso)"
                        }
                        strokeWidth={0.04}
                        strokeDasharray="0.08 0.06"
                        pointerEvents="none"
                      />
                    )}
                  </>
                ),
              }}
            />
          </div>
        </>
      )}
      <FullscreenDialog
        open={hydronicOpen}
        title="Scegli pompa di calore"
        closeLabel="Annulla"
        onClose={() => setHydronicOpen(false)}
        footer={
          <>
            <button className="bottone" onClick={() => setHydronicOpen(false)}>
              Annulla
            </button>
            <button
              className="bottone pieno"
              type="submit"
              form="plan-heat-pump"
              disabled={selectedHydronic?.outdoorUnit.locked}
            >
              Salva
            </button>
          </>
        }
      >
        {hydronicOpen && (selectedHeatPumpDraft || selectedHydronic) && (
          <HydronicPanel
            project={project}
            connectedRooms={hydronicRoomIds(project, selectedId!)}
            connectedCoils={hydronicTargets(project, selectedId!)
              .filter((t) => project.fanCoils?.some((c) => c.id === t.id))
              .map((t) => t.id)}
            floorId={room.floorId}
            systemId={selectedHydronic?.id}
            formId="plan-heat-pump"
            position={
              selectedHeatPumpDraft?.position ??
              selectedHydronic?.outdoorUnit.position
            }
            onPlace={(change) => {
              commit((current) => {
                const next = change(current);
                const placed = movePlacedDevice(
                  next,
                  selectedHydronic?.outdoorUnit.id ??
                    next.hydronicSystems!.at(-1)!.outdoorUnit.id,
                  selectedHeatPumpDraft?.position ??
                    selectedHydronic!.outdoorUnit.position,
                );
                return {
                  ...placed,
                  hydronicSystems: placed.hydronicSystems?.map((system) =>
                    system.id ===
                    (selectedHydronic?.id ?? placed.hydronicSystems!.at(-1)!.id)
                      ? {
                          ...system,
                          terminalIds: hydronicTargets(
                            current,
                            selectedId!,
                          ).map((t) => t.id),
                        }
                      : system,
                  ),
                  heatPumpDrafts: placed.heatPumpDrafts?.filter(
                    (item) => item.id !== selectedHeatPumpDraft?.id,
                  ),
                };
              });
              if (!useProjectStore.getState().error) {
                const system =
                  useProjectStore
                    .getState()
                    .project!.hydronicSystems!.find(
                      (item) => item.id === selectedHydronic?.id,
                    ) ??
                  useProjectStore.getState().project!.hydronicSystems!.at(-1)!;
                setSelectedId(system.outdoorUnit.id);
                if (mainPlan)
                  useProjectStore
                    .getState()
                    .select({ kind: "device", id: system.outdoorUnit.id });
                setHydronicOpen(false);
                setNotice("Macchina configurata e salvata.");
              }
            }}
          />
        )}
      </FullscreenDialog>
      <FullscreenDialog
        open={!!equipmentTarget}
        title="Configura apparecchio"
        closeLabel="Annulla"
        onClose={() => setEquipmentTarget(null)}
        footer={
          <>
            <button
              className="bottone"
              onClick={() => setEquipmentTarget(null)}
            >
              Annulla
            </button>
            <button
              className="bottone pieno"
              disabled={selectedEquipment?.locked}
              onClick={() => {
                if (
                  saveEquipmentButton.current &&
                  !saveEquipmentButton.current.disabled
                )
                  saveEquipmentButton.current.click();
                else
                  useProjectStore
                    .getState()
                    .setError(
                      "Scegli un modello o una soluzione compatibile prima di salvare.",
                    );
              }}
            >
              Salva
            </button>
          </>
        }
      >
        {equipmentTarget &&
          equipmentRoom &&
          (() => {
            const Panel =
              equipmentTarget.installation.type === "radiator"
                ? RadiatorPanel
                : equipmentTarget.installation.type === "fanCoil"
                  ? FanCoilPanel
                  : equipmentTarget.installation.type === "vrv"
                    ? VrvPanel
                    : SplitPanel;
            return (
              <Panel
                project={equipmentProject}
                room={equipmentRoom}
                installationId={equipmentTarget.installation.id}
                saveButtonRef={saveEquipmentButton}
                existingDeviceId={equipmentTarget.deviceId}
                onPlace={(change) => {
                  let placedId: string | undefined;
                  commit((current) => {
                    const oldRadiator = current.radiators.find(
                      (item) => item.id === equipmentTarget.deviceId,
                    );
                    const oldFanCoil = current.fanCoils?.find(
                      (item) => item.id === equipmentTarget.deviceId,
                    );
                    if (oldRadiator?.locked || oldFanCoil?.locked)
                      throw new Error(
                        "Sbloccare l’apparecchio prima di modificarlo.",
                      );
                    let next = change({
                      ...current,
                      radiators: current.radiators.filter(
                        (item) => item.id !== oldRadiator?.id,
                      ),
                      fanCoils: current.fanCoils?.filter(
                        (item) => item.id !== oldFanCoil?.id,
                      ),
                      installations: current.installations.some(
                        (item) => item.id === equipmentTarget.installation.id,
                      )
                        ? current.installations
                        : [
                            ...current.installations,
                            equipmentTarget.installation,
                          ],
                    });
                    const placed =
                      equipmentTarget.installation.type === "radiator"
                        ? next.radiators.find(
                            (device) =>
                              device.installationId ===
                                equipmentTarget.installation.id &&
                              !current.radiators.some(
                                (old) => old.id === device.id,
                              ),
                          )
                        : equipmentTarget.installation.type === "fanCoil"
                          ? next.fanCoils?.find(
                              (device) =>
                                device.installationId ===
                                  equipmentTarget.installation.id &&
                                !current.fanCoils?.some(
                                  (old) => old.id === device.id,
                                ),
                            )
                          : next.hvacSystems
                              .find(
                                (system) =>
                                  system.installationId ===
                                  equipmentTarget.installation.id,
                              )
                              ?.indoorUnits.find(
                                (device) => device.roomId === equipmentRoom.id,
                              );
                    if (!placed)
                      throw new Error("Nessun apparecchio da posizionare.");
                    if (oldRadiator)
                      next = {
                        ...next,
                        radiators: next.radiators.map((item) =>
                          item.id === placed.id
                            ? { ...oldRadiator, ...item, id: oldRadiator.id }
                            : (current.radiators.find(
                                (old) => old.id === item.id,
                              ) ?? item),
                        ),
                      };
                    if (oldFanCoil)
                      next = {
                        ...next,
                        fanCoils: next.fanCoils?.map((item) =>
                          item.id === placed.id
                            ? {
                                ...oldFanCoil,
                                ...item,
                                id: oldFanCoil.id,
                                ...(oldFanCoil.mounting === item.mounting
                                  ? {
                                      position: oldFanCoil.position,
                                      rotation: oldFanCoil.rotation,
                                      elevationM: oldFanCoil.elevationM,
                                      wallId: oldFanCoil.wallId,
                                    }
                                  : {}),
                              }
                            : item,
                        ),
                      };
                    placedId = oldRadiator?.id ?? oldFanCoil?.id ?? placed.id;
                    const moved = movePlacedDevice(
                      next,
                      placedId,
                      equipmentTarget.point,
                    );
                    return {
                      ...moved,
                      equipmentDrafts: moved.equipmentDrafts?.filter(
                        (item) => item.id !== equipmentTarget.draftId,
                      ),
                      heatPumpDrafts: moved.heatPumpDrafts?.map((pump) => ({
                        ...pump,
                        terminalIds: pump.terminalIds?.map((id) =>
                          id === equipmentTarget.draftId ? placedId! : id,
                        ),
                      })),
                      hydronicSystems: moved.hydronicSystems?.map((pump) => ({
                        ...pump,
                        terminalIds: pump.terminalIds?.map((id) =>
                          id === equipmentTarget.draftId ? placedId! : id,
                        ),
                        fanCoilIds:
                          equipmentTarget.installation.type === "fanCoil" &&
                          pump.terminalIds?.includes(
                            equipmentTarget.draftId ?? "",
                          )
                            ? [...new Set([...pump.fanCoilIds, placedId!])]
                            : pump.fanCoilIds,
                      })),
                    };
                  });
                  if (!useProjectStore.getState().error) {
                    setEquipmentTarget(null);
                    setSelectedId(placedId ?? null);
                    if (mainPlan && placedId)
                      useProjectStore
                        .getState()
                        .select({ kind: "device", id: placedId });
                    setNotice(
                      equipmentTarget.deviceId
                        ? "Configurazione salvata."
                        : "Apparecchio inserito. Il suo impianto è indipendente.",
                    );
                  }
                }}
              />
            );
          })()}
      </FullscreenDialog>
      <FullscreenDialog
        open={terminalOpen && !!selectedRoom && !!position}
        title={
          selectedTerminal
            ? "Configura bocchetta"
            : "Scegli bocchetta sul punto"
        }
        closeLabel="Annulla"
        onClose={() => setTerminalOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="bottone pericolo"
              disabled={members.some((item) => item.locked)}
              onClick={deleteSelected}
            >
              Elimina bocchetta
            </button>
            <button className="bottone" onClick={() => setTerminalOpen(false)}>
              Annulla
            </button>
            <button
              className="bottone pieno"
              onClick={() => {
                if (
                  saveTerminalButton.current &&
                  !saveTerminalButton.current.disabled
                )
                  saveTerminalButton.current.click();
                else
                  useProjectStore
                    .getState()
                    .setError(
                      "Scegli un modello e completa le dimensioni prima di salvare.",
                    );
              }}
            >
              Salva
            </button>
          </>
        }
      >
        {terminalOpen && selectedRoom && position && (
          <RoomAirTerminals
            key={selectedId}
            project={project}
            room={selectedRoom}
            installationId={
              (selectedDraft?.installationId ??
                selectedTerminal?.installationId ??
                project.hvacSystems.find(
                  (item) =>
                    item.id ===
                    (selectedTerminal?.systemId ??
                      selectedTerminal?.pendingSystemId),
                )?.installationId ??
                installation.id) ||
              undefined
            }
            systemId={
              selectedDraft?.machineId ??
              selectedTerminal?.systemId ??
              selectedTerminal?.pendingSystemId ??
              null
            }
            point={position}
            existingTerminalId={selectedTerminal?.id}
            draftId={selectedDraft?.id}
            initialUse={selectedDraft?.use}
            saveButtonRef={saveTerminalButton}
            onPlaced={() => {
              const saved = useProjectStore.getState().project!.airTerminals;
              const added =
                saved.find((item) => item.id === selectedTerminal?.id) ??
                saved.find((item) => item.id === members[0]?.id) ??
                saved.at(-1)!;
              setSelectedId(added.id);
              if (mainPlan)
                useProjectStore
                  .getState()
                  .select({ kind: "device", id: added.id });
              setTerminalOpen(false);
              setMode("select");
              setNotice(
                added.systemId
                  ? "Bocchetta aggiornata."
                  : "Bocchetta salvata. Usa Collega per associarla a una macchina.",
              );
            }}
          />
        )}
      </FullscreenDialog>
      {machineOpen && selectedRoom && (
        <DuctedMachinePicker
          key={selectedId}
          project={project}
          connectedRooms={connectedRoomIds(
            project,
            selectedMachineSystem?.id ?? selectedDraft!.id,
          )}
          hydronic={[
            ...(project.heatPumpDrafts ?? []),
            ...(project.hydronicSystems ?? []).map((s) => ({
              ...s.outdoorUnit,
              terminalIds: s.terminalIds,
            })),
          ].some((pump) =>
            hydronicTargets(project, pump.id).some((t) => t.id === selectedId),
          )}
          room={selectedRoom}
          installationId={
            selectedMachineSystem?.installationId ??
            selectedDraft?.installationId ??
            installation.id
          }
          systemId={selectedMachineSystem?.id ?? null}
          draftId={
            selectedDraft?.kind === "machine" ? selectedDraft.id : undefined
          }
          initialOpen
          onClosed={() => setMachineOpen(false)}
          onPlace={(change) => {
            commit((current) => {
              const next = change(current);
              const configured = next.hvacSystems.at(-1)!;
              if (!position || !selectedRoom)
                throw new Error(
                  "Inserisci prima la macchina sulla planimetria.",
                );
              return configureMachineOnPlan(
                next,
                configured.id,
                selectedRoom.id,
                position,
                selectedDraft?.id,
              );
            });
            if (!useProjectStore.getState().error) {
              const configured = useProjectStore
                .getState()
                .project!.hvacSystems.at(-1)!;
              setActiveSystemId(configured.id);
              setSelectedId(configured.indoorUnits[0].id);
              if (mainPlan)
                useProjectStore
                  .getState()
                  .select({ kind: "device", id: configured.indoorUnits[0].id });
              setNotice("Macchina configurata e salvata.");
            }
          }}
        />
      )}
      {!configurationOnly && selectedMachineSystem && !machineOpen && (
        <details>
          <summary>Canali della macchina selezionata</summary>
          <DuctPanel project={project} systemId={selectedMachineSystem.id} />
        </details>
      )}
      {!configurationOnly &&
        selectedTerminal &&
        !terminalOpen &&
        !configurationBlock(project, selectedTerminal.id) &&
        !needsTerminalReconfiguration(selectedTerminal) && (
          <details>
            <summary>Posizione e accessori della bocchetta selezionata</summary>
            <TerminalEditForm project={project} id={selectedTerminal.id} />
            <TerminalCommercialOptions
              project={project}
              terminalId={selectedTerminal.id}
            />
          </details>
        )}
    </section>
  );
}
