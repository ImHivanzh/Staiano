import type { Project } from "@/schemas/project";
import { installationRoom } from "../installations";
import { terminalSupplyConnections } from "@/domain/air-terminals/commercial-bom";
import {
  machinePlenumGeometry,
  type MachinePlenumGeometry,
} from "./machine-plenum";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { resolveDuctedMachine } from "./machine";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { distributeAirflow } from "./calculate";

export type PlenumSettings = {
  maxBranchVelocityMs: number;
  /** Legacy preference retained on import; physical catalogue ports stay separate. */
  grouping: "terminal" | "point";
};
export const DEFAULT_PLENUM_SETTINGS: PlenumSettings = {
  maxBranchVelocityMs: 2.5,
  grouping: "terminal",
};
/** Commercial nominal sizes, Lindab SR technical sheet 2025-09-29, page 1. */
export const PLENUM_DIAMETERS_MM = [
  63, 80, 100, 112, 125, 140, 150, 160, 180, 200, 224, 250, 280, 300, 315, 355,
  400, 450, 500, 560, 600, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1500,
  1600, 1800, 2000,
] as const;
export const PLENUM_SOURCES = [
  {
    title: "CIBSE Journal · Module 61 · February 2014",
    url: "https://www.cibsejournal.com/cpd/modules/2014-02/",
    description:
      "Q = area × velocità. L’esempio descrive 2,5 m/s come velocità tipica di una diramazione finale; criterio proposto modificabile, non limite normativo.",
  },
  {
    title: "Lindab SR · scheda tecnica 29/09/2025 · pagina 1",
    url: "https://www.lindab.ro/globalassets/commerce/lindabwebproductsdoc/assets/production/m2y0ztdlzgmtoty1yy00yte2ltkznjmty2izzgfjmgy4mjlh/5250635107236640062/sr_new.pdf?v=1770511151",
    description:
      "Serie di diametri nominali commerciali. Viene scelto il primo diametro non inferiore al minimo calcolato; disponibilità e diametro interno effettivo da confermare sul prodotto ordinato.",
  },
] as const;

type Terminal = Project["airTerminals"][number];
export type PlenumIssue = {
  code: string;
  message: string;
  entityId?: string;
};
export type PlenumBranch = {
  connectionSource?: string;
  plenumModelCode?: string;
  terminalPortIndex?: number;
  id: string;
  roomId: string;
  roomName: string;
  pointIndex: number | null;
  terminalIds: string[];
  terminalModels: string[];
  airflowM3h: number;
  minimumDiameterMm: number | null;
  diameterMm: number | null;
  velocityMs: number | null;
  verified: boolean;
  geometryVerified?: boolean;
};
export type SupplyPlenum = {
  machineGeometry?: MachinePlenumGeometry;
  systemId: string;
  systemName: string;
  machineModel: string | null;
  machineAirflowM3h: number | null;
  settings: PlenumSettings;
  status: "ready" | "pending" | "unavailable";
  branches: PlenumBranch[];
  groupedDiameters: { diameterMm: number; quantity: number }[];
  supplyAirflowM3h: number;
  supplyComplete: boolean;
  pendingSupplyPoints: {
    roomId: string;
    roomName: string;
    pointIndex: number;
  }[];
  returnTerminalCount: number;
  returnAirflowM3h: number;
  returnComplete: boolean;
  pendingReturnPoints: {
    roomId: string;
    roomName: string;
    pointIndex: number;
  }[];
  issues: PlenumIssue[];
};

/** SI continuity. Diameter is nominal; this does not calculate network losses. */
export function sizeCircularBranch(airflowM3h: number, maxVelocityMs: number) {
  if (
    !Number.isFinite(airflowM3h) ||
    airflowM3h <= 0 ||
    !Number.isFinite(maxVelocityMs) ||
    maxVelocityMs <= 0
  )
    return null;
  const minimumDiameterMm =
    1000 * Math.sqrt((4 * airflowM3h) / (3600 * Math.PI * maxVelocityMs));
  const diameterMm =
    PLENUM_DIAMETERS_MM.find(
      (diameter) =>
        diameter >= minimumDiameterMm - 8 * Number.EPSILON * minimumDiameterMm,
    ) ?? null;
  return {
    minimumDiameterMm,
    diameterMm,
    velocityMs:
      diameterMm === null
        ? null
        : airflowM3h / 3600 / ((Math.PI * (diameterMm / 1000) ** 2) / 4),
  };
}

function validSettings(value: PlenumSettings) {
  return (
    Number.isFinite(value.maxBranchVelocityMs) &&
    value.maxBranchVelocityMs >= 0.5 &&
    value.maxBranchVelocityMs <= 10 &&
    (value.grouping === "terminal" || value.grouping === "point")
  );
}
const close = (a: number, b: number) =>
  Number.isFinite(a) &&
  Number.isFinite(b) &&
  Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);

/** A branch is auditable only against the selected historical operating point. */
function terminalVerified(terminal: Terminal, requireCapacity = true) {
  if (needsTerminalReconfiguration(terminal)) return false;
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  const variant = family?.variants.find((v) => v.id === terminal.productId);
  const op =
    terminal.operatingPointIndex === null
      ? undefined
      : variant?.operatingPoints[terminal.operatingPointIndex];
  const noise = op?.noiseDbA ?? op?.noiseUpperBoundDbA;
  const capacity = op
    ? family?.isLinearPerMeter
      ? ((op.airflowPerMeterM3h ?? 0) * terminal.widthMm) / 1000
      : op.airflowM3h
    : null;
  return !!(
    op &&
    family?.use.includes(terminal.use) &&
    op.quality === "valid" &&
    (terminal.use === "return" ||
      (noise !== null && noise !== undefined && noise <= 37)) &&
    op.noiseDbA === terminal.noiseDbA &&
    op.noiseUpperBoundDbA === terminal.noiseUpperBoundDbA &&
    op.pressureDropPa === terminal.pressureDropPa &&
    capacity !== null &&
    close(capacity, terminal.availableAirflowM3h) &&
    (!requireCapacity || capacity >= terminal.requiredAirflowM3h) &&
    Number.isFinite(terminal.requiredAirflowM3h) &&
    terminal.requiredAirflowM3h > 0
  );
}

/** Independent result for one autonomous machine. Return terminals never create supply outlets. */
export function calculateSupplyPlenum(
  project: Project,
  systemId: string,
  override?: PlenumSettings,
): SupplyPlenum {
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  const settings = {
    ...DEFAULT_PLENUM_SETTINGS,
    ...system?.plenumSettings,
    ...override,
  };
  const result: SupplyPlenum = {
    systemId,
    systemName: system?.name || system?.manufacturer || "Canalizzato",
    machineModel: null,
    machineAirflowM3h: system?.airflowM3h ?? null,
    settings,
    status: "unavailable",
    branches: [],
    groupedDiameters: [],
    supplyAirflowM3h: 0,
    supplyComplete: false,
    pendingSupplyPoints: [],
    returnTerminalCount: 0,
    returnAirflowM3h: 0,
    returnComplete: false,
    pendingReturnPoints: [],
    issues: [],
  };
  if (!system) {
    result.issues.push({
      code: "machineMissing",
      message: "Configurare prima il canalizzato.",
    });
    return result;
  }
  if (!validSettings(settings)) {
    result.issues.push({
      code: "settingsInvalid",
      message:
        "Velocità ammessa tra 0,5 e 10 m/s e raggruppamento valido necessari.",
    });
    return result;
  }
  const rooms = project.rooms
    .filter((r) => system.roomIds.includes(r.id))
    .map((room) => installationRoom(project, room, system.installationId));
  const machine = hvacProductAtVersion(system.productId, system.catalogVersion);
  const resolved = resolveDuctedMachine(system);
  result.machineModel = resolved?.model ?? machine?.indoorModel ?? null;
  if (resolved?.dataOrigin === "manual")
    result.issues.push({
      code: "machineManual",
      message:
        "Macchina inserita manualmente; portata massima dichiarata dall’operatore. Potenza e attacchi da verificare.",
    });
  if (
    !resolved ||
    !system.airflowM3h ||
    !close(resolved.maxAirflowM3h, system.airflowM3h) ||
    rooms.length !== system.roomIds.length ||
    rooms.length === 0 ||
    rooms.some(
      (r) =>
        !!r.conditioningExclusion ||
        r.geometryStatus === "unresolved" ||
        !project.floors.find((f) => f.id === r.floorId)?.scaleVerified,
    )
  ) {
    result.issues.push({
      code: "machineUnverified",
      message:
        "Macchina, portata di catalogo o geometria da verificare prima del calcolo.",
    });
    return result;
  }
  let allocations: ReturnType<typeof distributeAirflow>;
  try {
    allocations = distributeAirflow(rooms, system.airflowM3h);
  } catch {
    result.issues.push({
      code: "allocationInvalid",
      message: "Portata o punti degli ambienti non validi.",
    });
    return result;
  }
  const terminals = project.airTerminals.filter((t) => t.systemId === systemId);
  const valid = new Map<string, boolean>();
  for (const use of ["supply", "return"] as const) {
    const selected = terminals.filter((t) => t.use === use);
    if (use === "return") {
      const capacity = selected.reduce(
        (sum, terminal) => sum + terminal.availableAirflowM3h,
        0,
      );
      result.returnTerminalCount = selected.length;
      result.returnAirflowM3h = Math.min(capacity, system.airflowM3h);
      result.returnComplete =
        selected.length > 0 &&
        selected.every((terminal) => terminalVerified(terminal, false)) &&
        capacity + 1e-7 >= system.airflowM3h;
      if (!result.returnComplete) {
        result.pendingReturnPoints.push({
          roomId: rooms[0].id,
          roomName: rooms[0].name,
          pointIndex: 0,
        });
        result.issues.push({
          code: "returnCapacity",
          entityId: system.id,
          message: `Ripresa totale ${Math.round(capacity)} m³/h / macchina ${Math.round(system.airflowM3h)} m³/h: completa o verifica le griglie.`,
        });
      }
      continue;
    }
    const pending =
      use === "supply"
        ? result.pendingSupplyPoints
        : result.pendingReturnPoints;
    let allValid = true;
    for (const room of rooms) {
      const allocation = allocations.find((a) => a.roomId === room.id)!;
      const physical = selected.filter((t) => t.roomId === room.id);
      if (
        physical.some((t) => t.decisionOrigin !== "calculated" || t.proposalId)
      ) {
        const totalCapacity = physical.reduce(
          (sum, t) => sum + t.availableAirflowM3h,
          0,
        );
        for (const terminal of physical) {
          const expected =
            (allocation.airflowM3h * terminal.availableAirflowM3h) /
            totalCapacity;
          const verified =
            terminalVerified(terminal) &&
            close(terminal.requiredAirflowM3h, expected);
          valid.set(terminal.id, verified);
          if (!verified) allValid = false;
        }
        if (totalCapacity + 1e-7 < allocation.airflowM3h) {
          allValid = false;
          result.issues.push({
            code: `${use}Capacity`,
            entityId: room.id,
            message: `${room.name}: portata installata insufficiente; distribuzione scelta dall’operatore.`,
          });
        }
        continue;
      }
      const points = use === "supply" ? room.supplyPoints : room.returnPoints;
      for (let pointIndex = 0; pointIndex < points; pointIndex++) {
        const atPoint = selected.filter(
          (t) => t.roomId === room.id && t.pointIndex === pointIndex,
        );
        if (!atPoint.length) {
          pending.push({ roomId: room.id, roomName: room.name, pointIndex });
          allValid = false;
          continue;
        }
        const expected = allocation.airflowM3h / points / atPoint.length;
        const uniqueUnits =
          new Set(atPoint.map((t) => t.unitIndex)).size === atPoint.length;
        for (const terminal of atPoint) {
          const verified =
            terminalVerified(terminal) &&
            uniqueUnits &&
            close(terminal.requiredAirflowM3h, expected);
          valid.set(terminal.id, verified);
          if (!verified) {
            allValid = false;
            result.issues.push({
              code: "terminalUnverified",
              entityId: terminal.id,
              message: `${room.name}: ${use === "supply" ? "mandata" : "ripresa"} ${pointIndex + 1} da riconfigurare o portata insufficiente.`,
            });
          }
        }
      }
    }
    for (const terminal of selected) {
      if (!valid.has(terminal.id)) {
        valid.set(terminal.id, false);
        allValid = false;
        result.issues.push({
          code: "pointInvalid",
          entityId: terminal.id,
          message: `${terminal.productId}: punto o ambiente non coerente con questa macchina.`,
        });
      }
    }
    const airflow = selected.reduce((sum, t) => sum + t.requiredAirflowM3h, 0);
    const complete =
      allValid && selected.length > 0 && close(airflow, system.airflowM3h);
    if (use === "supply") {
      result.supplyAirflowM3h = airflow;
      result.supplyComplete = complete;
    } else {
      result.returnTerminalCount = selected.length;
      result.returnAirflowM3h = airflow;
      result.returnComplete = complete;
    }
    if (pending.length)
      result.issues.push({
        code: `${use}Missing`,
        message: `${pending.length} ${use === "supply" ? "punti di mandata" : "punti di ripresa"} ancora da configurare.`,
      });
    if (selected.length && !close(airflow, system.airflowM3h))
      result.issues.push({
        code: `${use}Balance`,
        message: `La somma delle portate di ${use === "supply" ? "mandata" : "ripresa"} non coincide con la portata macchina.`,
      });
  }
  const connections = terminalSupplyConnections(project, systemId);
  const sourceBranches: PlenumBranch[] = [];
  for (const terminal of terminals.filter((t) => t.use === "supply")) {
    const family = airTerminalFamilyAtVersion(
      terminal.family,
      terminal.catalogVersion,
    );
    const variant = family?.variants.find((v) => v.id === terminal.productId);
    const supplied = connections.connections.filter(
      (c) => c.terminalId === terminal.id,
    );
    const direct = variant?.connectionDiametersMm?.length
      ? variant.connectionDiametersMm
      : variant?.connectionDiameterMm
        ? [variant.connectionDiameterMm]
        : variant?.nominalDiameterMm
          ? [variant.nominalDiameterMm]
          : [];
    const ports = supplied.length
      ? supplied.map((c) => ({
          diameter: c.portDiameterMm,
          flow: c.airflowM3h,
          index: c.terminalPortIndex,
          source: c.sourceMetadata.sourceUrl,
          plenum: c.plenumModelCode,
        }))
      : direct.map((diameter, index) => ({
          diameter,
          flow: terminal.requiredAirflowM3h / direct.length,
          index,
          source: family!.sourceMetadata.sourceUrl,
          plenum: undefined,
        }));
    const room = rooms.find((r) => r.id === terminal.roomId);
    if (!ports.length) {
      sourceBranches.push({
        id: terminal.id,
        roomId: terminal.roomId,
        roomName: room?.name ?? "Ambiente",
        pointIndex: terminal.pointIndex,
        terminalIds: [terminal.id],
        terminalModels: [terminal.productId],
        airflowM3h: terminal.requiredAirflowM3h,
        minimumDiameterMm: null,
        diameterMm: null,
        velocityMs: null,
        verified: false,
      });
      result.issues.push({
        code: "connectionMissing",
        entityId: terminal.id,
        message: `${room?.name}: stacchi del modello o del plenum da selezionare sulla scheda.`,
      });
      continue;
    }
    ports.forEach((port) => {
      const verified = valid.get(terminal.id) === true;
      const geometryVerified =
        verified ||
        (terminal.decisionOrigin !== "calculated" &&
          terminalVerified(terminal, false) &&
          port.diameter > 0);
      const size = sizeCircularBranch(port.flow, settings.maxBranchVelocityMs);
      if (verified && size?.diameterMm === null)
        result.issues.push({
          code: "diameterUnavailable",
          entityId: `${terminal.id}:port:${port.index}`,
          message: `${room?.name ?? "Ambiente"}: diametro oltre la serie commerciale disponibile.`,
        });
      sourceBranches.push({
        id: `${terminal.id}:port:${port.index}`,
        roomId: terminal.roomId,
        roomName: room?.name ?? "Ambiente",
        pointIndex: terminal.pointIndex,
        terminalIds: [terminal.id],
        terminalModels: [terminal.productId],
        airflowM3h: port.flow,
        minimumDiameterMm: size?.minimumDiameterMm ?? null,
        diameterMm: geometryVerified ? port.diameter : null,
        velocityMs: geometryVerified
          ? port.flow / 3600 / ((Math.PI * (port.diameter / 1000) ** 2) / 4)
          : null,
        verified,
        geometryVerified,
        connectionSource: port.source,
        plenumModelCode: port.plenum,
        terminalPortIndex: port.index,
      });
    });
  }
  result.branches = sourceBranches;
  result.machineGeometry = machinePlenumGeometry(
    result.branches,
    machine,
    project.plenums.find((pl) => pl.systemId === systemId)?.designSettings ??
      undefined,
    system.genericMachine,
  );
  const groupedDiameters = new Map<number, number>();
  for (const branch of result.branches)
    if (branch.diameterMm !== null)
      groupedDiameters.set(
        branch.diameterMm,
        (groupedDiameters.get(branch.diameterMm) ?? 0) + 1,
      );
  result.groupedDiameters = [...groupedDiameters]
    .sort(([a], [b]) => a - b)
    .map(([diameterMm, quantity]) => ({ diameterMm, quantity }));
  result.status =
    result.supplyComplete &&
    result.returnComplete &&
    result.branches.every((b) => b.verified)
      ? "ready"
      : "pending";
  return result;
}
