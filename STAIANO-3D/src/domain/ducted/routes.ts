import type { Duct, Plenum, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import { placedPlenumGeometry } from "./placement";
import { indoorRoute } from "@/domain/geometry/indoor-route";
import {
  footprintCorners,
  nearestFootprintEdge,
} from "@/domain/geometry/footprint";
import {
  pointInPolygon,
  lineIntersection,
  onSegment,
} from "../geometry/primitives";
import { linearRunMembers } from "../air-terminals/linear-run";
import { needsTerminalReconfiguration } from "../air-terminals/legacy";

export type RoutePoint = Point & { elevationM: number };

/** Sezione rettangolare equivalente allo stacco circolare, con proporzione 2:1. */
export function rectangularSection(diameterMm: number) {
  const heightMm = Math.max(
    60,
    Math.ceil(
      (Math.sqrt((Math.PI * (diameterMm / 1000) ** 2) / 4 / 2) * 1000) / 10,
    ) * 10,
  );
  return { widthMm: Math.max(100, heightMm * 2), heightMm };
}

export function routeBelowTerminals(
  project: Project,
  floorId: string,
  points: RoutePoint[],
  terminalIds: string[],
  radiusM: number,
): RoutePoint[] {
  if (points.length < 2) return points;
  let elevation = Math.min(...points.map((point) => point.elevationM));
  let crossing = false;
  for (const terminal of project.airTerminals) {
    if (
      terminal.floorId !== floorId ||
      terminalIds.includes(terminal.id) ||
      terminal.elevationM === null ||
      needsTerminalReconfiguration(terminal)
    )
      continue;
    const footprint = footprintCorners(
      terminal.position,
      terminal.widthMm / 1000 + radiusM * 2,
      (terminal.mounting === "ceiling"
        ? terminal.heightMm
        : (terminal.depthMm ?? 0)) /
        1000 +
        radiusM * 2,
      terminal.rotation,
    );
    const bottom =
      terminal.elevationM -
      (terminal.mounting === "wall" ? terminal.heightMm / 2000 : 0);
    const limit = bottom - radiusM - 0.02;
    if (
      !points.slice(1).some((end, i) => {
        const start = points[i];
        if (Math.max(start.elevationM, end.elevationM) <= limit) return false;
        return (
          pointInPolygon(start, footprint) ||
          pointInPolygon(end, footprint) ||
          footprint.some((corner, j) => {
            const next = footprint[(j + 1) % footprint.length];
            const hit = lineIntersection(start, end, corner, next);
            return hit
              ? onSegment(hit, start, end) && onSegment(hit, corner, next)
              : onSegment(corner, start, end) || onSegment(next, start, end);
          })
        );
      })
    )
      continue;
    crossing = true;
    elevation = Math.min(elevation, limit);
  }
  if (!crossing) return points;
  return [
    points[0],
    ...points.map((point) => ({ ...point, elevationM: elevation })),
    points.at(-1)!,
  ];
}

export function airConnectionRoutes(project: Project, floorId: string) {
  return project.airTerminals.flatMap((terminal) => {
    const members = linearRunMembers(project, terminal);
    if (
      terminal.floorId !== floorId ||
      !terminal.systemId ||
      needsTerminalReconfiguration(terminal) ||
      members[0]?.id !== terminal.id ||
      project.ducts?.some((duct) =>
        members.some((member) => duct.terminalId === member.id),
      )
    )
      return [];
    const machine = project.hvacSystems.find(
      (system) => system.id === terminal.systemId && system.type === "ducted",
    )?.indoorUnits[0];
    if (!machine || machine.floorId !== floorId || terminal.elevationM === null)
      return [];
    const route = indoorRoute(
      project,
      floorId,
      nearestFootprintEdge(machine, terminal.position),
      terminal.position,
    );
    if (route.length < 2) return [];
    const startElevation =
      (project.rooms.find((room) => room.id === machine.roomId)?.heightM ??
        2.7) -
      machine.heightMm / 2000 -
      0.05;
    const endElevation = terminal.elevationM;
    const points = route.map((point, index) => ({
      ...point,
      elevationM:
        startElevation +
        ((endElevation - startElevation) * index) / (route.length - 1),
    }));
    const below = routeBelowTerminals(
      project,
      floorId,
      points,
      members.map((member) => member.id),
      0.035,
    );
    return [
      {
        terminalId: terminal.id,
        points: terminal.use === "return" ? below.reverse() : below,
      },
    ];
  });
}
export function plenumLocalToPlan(
  plenum: Plenum,
  local: [number, number, number],
): RoutePoint {
  const forward = local[2] - plenum.depthMm / 2000;
  return {
    x:
      plenum.position.x +
      local[0] * Math.cos(plenum.rotation) -
      forward * Math.sin(plenum.rotation),
    y:
      plenum.position.y +
      local[0] * Math.sin(plenum.rotation) +
      forward * Math.cos(plenum.rotation),
    elevationM: (plenum.elevationM ?? 2) + local[1],
  };
}

/** Endpoints derive from the shared objects; only operator waypoints are saved. */
export function ductRoute(
  project: Project,
  duct: Duct,
  suppliedGeometry?: ReturnType<typeof placedPlenumGeometry>,
): RoutePoint[] {
  const plenum = project.plenums.find((pl) => pl.id === duct.plenumId);
  if (!plenum) return [];
  const geometry =
    suppliedGeometry === undefined
      ? placedPlenumGeometry(project, plenum)
      : suppliedGeometry;
  if (duct.terminalId) {
    const terminal = project.airTerminals.find((t) => t.id === duct.terminalId);
    const port = geometry?.ports.find((p) => p.branch.id === duct.branchId);
    if (!terminal || !port) return [];
    const start = plenumLocalToPlan(plenum, [
      port.centerMm[0] / 1000,
      port.centerMm[1] / 1000,
      (port.centerMm[2] + port.collarLengthMm) / 1000,
    ]);
    const end = { ...terminal.position, elevationM: terminal.elevationM ?? 0 };
    const automatic =
      duct.routing === "manual"
        ? []
        : indoorRoute(project, plenum.floorId, start, end).map((p) => ({
            ...p,
            elevationM: start.elevationM,
          }));
    if (duct.routing !== "manual" && !automatic.length) return [];
    const points = [
      start,
      ...(duct.routing === "manual" ? duct.waypoints : automatic),
      end,
    ];
    if (duct.routing === "manual") return points;
    const radius =
      duct.shape === "circle"
        ? (duct.diameterMm ?? 0) / 2000
        : Math.hypot(duct.widthMm ?? 0, duct.heightMm ?? 0) / 2000;
    return routeBelowTerminals(
      project,
      plenum.floorId,
      points,
      linearRunMembers(project, terminal).map((member) => member.id),
      radius,
    );
  }
  const machine = project.hvacSystems.find((s) => s.id === duct.systemId)
    ?.indoorUnits[0];
  if (!machine) return [];
  const start = {
    x:
      machine.position.x -
      (Math.sin(machine.rotation) * machine.depthMm) / 2000,
    y:
      machine.position.y +
      (Math.cos(machine.rotation) * machine.depthMm) / 2000,
    elevationM:
      project.rooms.find((r) => r.id === machine.roomId)!.heightM -
      machine.heightMm / 2000 -
      0.05,
  };
  const end = plenumLocalToPlan(plenum, [0, 0, 0]);
  if (duct.routing === "manual" || duct.waypoints.length)
    return [start, ...duct.waypoints, end];
  const automatic = indoorRoute(project, plenum.floorId, start, end);
  const points = automatic.length
    ? [
        start,
        ...automatic.slice(1).map((p) => ({
          ...p,
          elevationM: start.elevationM,
        })),
        end,
      ]
    : [];
  return routeBelowTerminals(
    project,
    plenum.floorId,
    points,
    [],
    duct.shape === "circle"
      ? (duct.diameterMm ?? 0) / 2000
      : Math.hypot(duct.widthMm ?? 0, duct.heightMm ?? 0) / 2000,
  );
}

export function generateDuctRoutes(
  project: Project,
  systemId: string,
): Project {
  const plenum = project.plenums.find(
    (pl) => pl.systemId === systemId && pl.use === "supply",
  );
  if (!plenum)
    throw new Error(
      "Posizionare il plenum dedicato alla macchina prima di generare i canali.",
    );
  const geometry = placedPlenumGeometry(project, plenum);
  if (!geometry?.inlet) throw new Error("Attacco macchina non disponibile.");
  const preserved = (project.ducts ?? []).filter(
    (d) => d.systemId !== systemId || d.decisionOrigin === "manual" || d.locked,
  );
  const ducts: Duct[] = [];
  const add = (
    branchId: string | null,
    terminalId: string | null,
    diameterMm: number | null,
  ) => {
    if (
      preserved.some(
        (d) =>
          d.systemId === systemId &&
          d.branchId === branchId &&
          d.terminalId === terminalId,
      )
    )
      return;
    ducts.push({
      id: newId(),
      systemId,
      plenumId: plenum.id,
      terminalId,
      branchId,
      diameterMm,
      shape: "rectangle",
      widthMm: terminalId
        ? rectangularSection(diameterMm ?? 100).widthMm
        : geometry.inlet!.connectionWidthMm,
      heightMm: terminalId
        ? rectangularSection(diameterMm ?? 100).heightMm
        : geometry.inlet!.connectionHeightMm,
      routing: "orthogonal",
      waypoints: [],
      decisionOrigin: "suggested",
      locked: false,
    });
  };
  add(null, null, null);
  for (const port of geometry.ports)
    for (const terminalId of port.branch.terminalIds) {
      const terminal = project.airTerminals.find(
        (t) => t.id === terminalId && t.plenumId === plenum.id,
      );
      if (terminal) add(port.branch.id, terminalId, port.diameterMm);
    }
  return { ...project, ducts: [...preserved, ...ducts] };
}

/**
 * Salva il percorso tracciato in pianta per il canale di una bocchetta.
 * Sezione rettangolare equivalente allo stacco, elevazione del plenum.
 */
export function setDuctRoute(
  project: Project,
  terminalId: string,
  points: Point[],
): Project {
  const terminal = project.airTerminals.find((item) => item.id === terminalId);
  if (!terminal || !terminal.systemId)
    throw new Error("Collegare prima la bocchetta alla macchina.");
  const plenum =
    project.plenums.find((pl) => pl.id === terminal.plenumId) ??
    project.plenums.find(
      (pl) => pl.systemId === terminal.systemId && pl.use === terminal.use,
    );
  if (!plenum)
    throw new Error(
      "Creare il plenum di questo lato prima di disegnare il canale.",
    );
  if (!points.length)
    throw new Error("Traccia almeno un punto del canale in pianta.");
  const geometry = placedPlenumGeometry(project, plenum);
  const port = geometry?.ports.find((item) =>
    item.branch.terminalIds.includes(terminal.id),
  );
  const elevationM =
    (plenum.elevationM ?? 2) + (port ? port.centerMm[1] / 1000 : 0);
  const section = rectangularSection(port?.diameterMm ?? 100);
  const waypoints = points.map((point) => ({ ...point, elevationM }));
  // La bocchetta resta agganciata al plenum del proprio lato.
  const linked: Project =
    terminal.plenumId === plenum.id
      ? project
      : {
          ...project,
          airTerminals: project.airTerminals.map((item) =>
            item.id === terminal.id ? { ...item, plenumId: plenum.id } : item,
          ),
        };
  const existing = (linked.ducts ?? []).find(
    (duct) => duct.terminalId === terminal.id && duct.plenumId === plenum.id,
  );
  if (existing)
    return {
      ...linked,
      ducts: (linked.ducts ?? []).map((duct) =>
        duct.id === existing.id
          ? {
              ...duct,
              branchId: port?.branch.id ?? duct.branchId,
              diameterMm: port?.diameterMm ?? duct.diameterMm,
              shape: "rectangle" as const,
              widthMm: section.widthMm,
              heightMm: section.heightMm,
              routing: "manual" as const,
              waypoints,
              decisionOrigin: "manual" as const,
            }
          : duct,
      ),
    };
  const duct: Duct = {
    id: newId(),
    systemId: terminal.systemId,
    plenumId: plenum.id,
    terminalId: terminal.id,
    branchId: port?.branch.id ?? null,
    shape: "rectangle",
    diameterMm: port?.diameterMm ?? null,
    widthMm: section.widthMm,
    heightMm: section.heightMm,
    routing: "manual",
    waypoints,
    decisionOrigin: "manual",
    locked: false,
  };
  return { ...linked, ducts: [...(linked.ducts ?? []), duct] };
}

export const ductLength = (points: RoutePoint[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum +
        Math.hypot(
          p.x - points[i].x,
          p.y - points[i].y,
          p.elevationM - points[i].elevationM,
        ),
      0,
    );
