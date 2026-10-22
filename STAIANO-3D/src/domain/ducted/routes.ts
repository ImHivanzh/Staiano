import type { Duct, Plenum, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import {
  machinePlenum,
  machinePlenums,
  placedPlenumGeometry,
} from "./placement";
import {
  floorRoutingPolygons,
  indoorRoute,
  segmentInsideFloor,
} from "@/domain/geometry/indoor-route";
import { flexibleDuctCurve } from "./flexible-curve";
import { wallCavityGeometry, wallCavityPolygons } from "./wall-cavity";
import { roofHeightAt } from "../geometry/ceilings";
import { footprintCorners } from "@/domain/geometry/footprint";
import {
  pointInPolygon,
  lineIntersection,
  onSegment,
} from "../geometry/primitives";
import { linearRunMembers } from "../air-terminals/linear-run";
import { needsTerminalReconfiguration } from "../air-terminals/legacy";
import {
  attachedPlenumPorts,
  plenumConnectionSide,
  syncAttachedPlenums,
  terminalPlenum,
} from "./attached-plenums";
import { connectTerminalOnPlan } from "./graphic-installation";

export type RoutePoint = Point & { elevationM: number };

/** Start on a real outlet of the machine plenum, never on the machine casing. */
function machineDuctStart(
  project: Project,
  systemId: string,
  terminalId: string,
  portIndex = 0,
): RoutePoint | null {
  const terminal = project.airTerminals.find((t) => t.id === terminalId);
  if (!terminal) return null;
  const plenum = machinePlenum(project, systemId, terminal.use);
  if (!plenum) return null;
  if (!placedPlenumGeometry(project, plenum) && plenum.attachmentId) {
    const port = attachedPlenumPorts(project, plenum)[portIndex];
    if (!port) return null;
    return { x: port.x, y: port.y, elevationM: port.elevationM };
  }
  const ports =
    placedPlenumGeometry(project, plenum)?.ports.filter((p) =>
      p.branch.terminalIds.includes(terminalId),
    ) ?? [];
  const port = ports[portIndex];
  return port
    ? plenumLocalToPlan(plenum, [
        port.centerMm[0] / 1000,
        port.centerMm[1] / 1000,
        (port.centerMm[2] + port.collarLengthMm) / 1000,
      ])
    : null;
}

function flexibleCollarLeads(
  project: Project,
  systemId: string,
  terminal: Project["airTerminals"][number],
  start: RoutePoint,
  end: RoutePoint,
  diameterMm: number,
  leadMultiplier = 1.1,
) {
  const source = machinePlenum(project, systemId, terminal.use);
  const target = terminalPlenum(project, terminal);
  if (!source || !target) return null;
  // Leave both collars straight before bending, so the hose cannot cut through either body.
  const lead = Math.max(0.1, (leadMultiplier * diameterMm) / 1000);
  const direction = placedPlenumGeometry(project, source) ? 1 : -1;
  const from = {
    x: start.x - Math.sin(source.rotation) * lead * direction,
    y: start.y + Math.cos(source.rotation) * lead * direction,
    elevationM: start.elevationM,
  };
  const side = plenumConnectionSide(project, target);
  const to = {
    x:
      end.x +
      ((side === "left" ? -1 : side === "right" ? 1 : 0) *
        Math.cos(target.rotation) -
        (side === "rear" ? -1 : 0) * Math.sin(target.rotation)) *
        lead,
    y:
      end.y +
      ((side === "left" ? -1 : side === "right" ? 1 : 0) *
        Math.sin(target.rotation) +
        (side === "rear" ? -1 : 0) * Math.cos(target.rotation)) *
        lead,
    elevationM:
      end.elevationM +
      (side === "top" ? lead : side === "bottom" ? -lead : 0),
  };
  return { source, target, from, to, lead };
}

function manualFlexibleRoute(
  project: Project,
  duct: Duct,
  terminal: Project["airTerminals"][number],
  start: RoutePoint,
  end: RoutePoint,
): RoutePoint[] {
  const leads = flexibleCollarLeads(
    project,
    duct.systemId,
    terminal,
    start,
    end,
    duct.diameterMm ?? 160,
  );
  // Senza curve resta il tubo dritto fra i collari, così non sparisce dalla scena.
  return leads ? [start, leads.from, ...duct.waypoints, leads.to, end] : [];
}

function flexibleConnectionRoute(
  project: Project,
  systemId: string,
  terminal: Project["airTerminals"][number],
  start: RoutePoint,
  end: RoutePoint,
  diameterMm: number,
) {
  for (const leadMultiplier of [3, 2, 1.1]) {
    const leads = flexibleCollarLeads(
      project,
      systemId,
      terminal,
      start,
      end,
      diameterMm,
      leadMultiplier,
    );
    if (!leads) return [];
    const { source, target, from, to, lead } = leads;
    const cavityGeometry = wallCavityGeometry(project, terminal);
    const cavity = cavityGeometry?.polygon;
    if (cavity) {
      const depth = cavityGeometry!.depthM;
      const normal = {
        x: -cavityGeometry!.normal.x,
        y: -cavityGeometry!.normal.y,
      };
      const radius = diameterMm / 2000;
      const toDepth =
        (to.x - cavity[0].x) * normal.x + (to.y - cavity[0].y) * normal.y;
      if (depth < target.depthMm / 1000 || toDepth + radius > depth + 1e-6)
        continue;
    }
    const polygons = [
      ...floorRoutingPolygons(project, terminal.floorId),
      ...wallCavityPolygons(project, terminal.floorId),
    ];
    const candidates: { points: RoutePoint[]; length: number }[] = [];
    for (const sourceOffset of [0, -2 * lead, 2 * lead]) {
      for (const targetOffset of [0, -2 * lead, 2 * lead]) {
        const a = {
          x: from.x + Math.cos(source.rotation) * sourceOffset,
          y: from.y + Math.sin(source.rotation) * sourceOffset,
        };
        const b = {
          x: to.x + Math.cos(target.rotation) * targetOffset,
          y: to.y + Math.sin(target.rotation) * targetOffset,
        };
        const routes = [
          indoorRoute(project, terminal.floorId, a, b, polygons),
          indoorRoute(project, terminal.floorId, b, a, polygons).reverse(),
          [a, b],
        ];
        for (const route of routes) {
          if (route.length < 2) continue;
          const points = [
            start,
            from,
            ...route.map((point, i) => ({
              ...point,
              elevationM:
                from.elevationM +
                ((to.elevationM - from.elevationM) * i) / (route.length - 1),
            })),
            to,
            end,
          ];
          const rounded = flexibleDuctCurve(points, diameterMm);
          if (!rounded) continue;
          const samples = rounded.curve.getSpacedPoints(
            Math.max(24, Math.ceil(rounded.curve.getLength() / 0.05)),
          );
          const radius = diameterMm / 2000;
          if (
            terminal.mounting === "wall" &&
            samples.some((point) => {
              const plan = { x: point.x, y: point.z };
              const containing = project.rooms.filter(
                (room) =>
                  room.floorId === terminal.floorId &&
                  pointInPolygon(plan, room.polygon),
              );
              const rooms = containing.length
                ? containing
                : project.rooms.filter((room) => room.id === terminal.roomId);
              return (
                point.y + radius >
                Math.max(
                  ...rooms.map((room) => roofHeightAt(project, room, plan)),
                ) +
                  1e-6
              );
            })
          )
            continue;
          if (
            !samples.every(
              (p) =>
                p.y >= radius &&
                segmentInsideFloor(
                  { x: p.x - radius, y: p.z },
                  { x: p.x + radius, y: p.z },
                  polygons,
                ) &&
                segmentInsideFloor(
                  { x: p.x, y: p.z - radius },
                  { x: p.x, y: p.z + radius },
                  polygons,
                ),
            )
          )
            continue;
          if (
            !samples
              .slice(1)
              .every((p, i) =>
                segmentInsideFloor(
                  { x: samples[i].x, y: samples[i].z },
                  { x: p.x, y: p.z },
                  polygons,
                ),
              )
          )
            continue;
          candidates.push({ points, length: rounded.curve.getLength() });
        }
      }
    }
    const best = candidates.sort((a, b) => a.length - b.length)[0];
    if (best) return best.points;
  }
  return [];
}

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
    if (
      terminal.floorId !== floorId ||
      !terminal.systemId ||
      terminal.elevationM === null ||
      needsTerminalReconfiguration(terminal) ||
      project.ducts?.some((d) => d.terminalId === terminal.id)
    )
      return [];
    const plenum = terminalPlenum(project, terminal);
    if (!plenum) return [];
    return attachedPlenumPorts(project, plenum).flatMap((end, index) => {
      const start = machineDuctStart(
        project,
        terminal.systemId!,
        terminal.id,
        index,
      );
      if (!start) return [];
      const points = flexibleConnectionRoute(
        project,
        terminal.systemId!,
        terminal,
        start,
        end,
        end.diameterMm,
      );
      const below = routeBelowTerminals(
        project,
        floorId,
        points,
        [terminal.id],
        end.diameterMm / 2000,
      );
      return [
        {
          terminalId: terminal.id,
          portIndex: index,
          diameterMm: end.diameterMm,
          end,
          points: terminal.use === "return" ? below.reverse() : below,
        },
      ];
    });
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
  const terminal = project.airTerminals.find((t) => t.id === duct.terminalId);
  if (duct.terminalId && (!terminal || !terminalPlenum(project, terminal)))
    return [];
  if (
    plenum.attachmentId &&
    project.airTerminals.some((t) => t.id === plenum.attachmentId)
  ) {
    const machine = project.hvacSystems.find((s) => s.id === duct.systemId)
      ?.indoorUnits[0];
    const terminal = project.airTerminals.find((t) => t.id === duct.terminalId);
    if (!machine || !terminal) return [];
    const end = attachedPlenumPorts(project, plenum)[
      Number(duct.branchId?.split(":").at(-1) ?? 0)
    ];
    if (!end) return [];
    const start = machineDuctStart(
      project,
      duct.systemId,
      terminal.id,
      Number(duct.branchId?.split(":").at(-1) ?? 0),
    );
    if (!start) return [];
    if (duct.routing === "manual")
      // Percorso tracciato a mano: tubo da plenum a plenum lungo i punti salvati.
      return duct.kind === "flexible"
        ? manualFlexibleRoute(project, duct, terminal, start, end)
        : duct.waypoints.length
          ? [start, ...duct.waypoints, end]
          : [];
    return flexibleConnectionRoute(
      project,
      duct.systemId,
      terminal,
      start,
      end,
      duct.diameterMm ?? 160,
    );
  }
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
    const terminalBody = terminalPlenum(project, terminal);
    const end = terminalBody
      ? attachedPlenumPorts(project, terminalBody)[
          port.branch.terminalPortIndex ?? 0
        ]
      : null;
    if (!end) return [];
    if (duct.kind === "flexible" && duct.routing === "manual")
      return manualFlexibleRoute(project, duct, terminal, start, end);
    if (duct.kind === "flexible" && duct.routing !== "manual")
      return flexibleConnectionRoute(
        project,
        duct.systemId,
        terminal,
        start,
        end,
        duct.diameterMm ?? 160,
      );
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
  if (project.plenums.some((p) => p.systemId === systemId && p.attachmentId))
    return syncAttachedPlenums(project);
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
      kind: terminalId ? "flexible" : "rigid",
      diameterMm,
      shape: terminalId ? "circle" : "rectangle",
      widthMm: terminalId ? null : geometry.inlet!.connectionWidthMm,
      heightMm: terminalId ? null : geometry.inlet!.connectionHeightMm,
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
 * Flessibile: tubo corrugato tondo dello stacco; rigido: sezione rettangolare.
 */
export function setDuctRoute(
  project: Project,
  terminalId: string,
  points: Point[],
  kind: "rigid" | "flexible" = "flexible",
): Project {
  const terminal = project.airTerminals.find((item) => item.id === terminalId);
  if (!terminal || !terminal.systemId)
    throw new Error("Collegare prima la bocchetta alla macchina.");
  if (!points.length)
    throw new Error("Traccia almeno un punto del canale in pianta.");
  // Il tubo unisce plenum macchina e plenum bocchetta: il corpo della
  // bocchetta deve esistere come elemento separato e collegato.
  const body = terminalPlenum(project, terminal);
  if (!body)
    throw new Error(
      "La bocchetta non ha un plenum collegato: crealo con lo strumento Plenum e collegalo, poi traccia il canale.",
    );
  const linked: Project = project.plenums.some((p) => p.id === body.id)
    ? project
    : {
        ...project,
        plenums: [...project.plenums, { ...body, status: "manual" as const }],
      };
  if (!machinePlenum(linked, terminal.systemId, terminal.use))
    throw new Error(
      "Posizionare il plenum della macchina prima di disegnare il canale.",
    );
  const next = syncAttachedPlenums(linked);
  const plenum = next.plenums.find((p) => p.id === body.id)!;
  const section = rectangularSection(plenum.portDiameterMm ?? 100);
  const machine = machinePlenum(next, terminal.systemId, terminal.use)!;
  // Il tubo sale dal plenum macchina a quello della bocchetta lungo il
  // percorso tracciato: le quote seguono la distanza, non saltano al collare.
  const from = machine.position;
  const to = plenum.position;
  const segments = [from, ...points, to];
  const lengths = segments
    .slice(1)
    .map((point, i) =>
      Math.hypot(point.x - segments[i].x, point.y - segments[i].y),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let travelled = 0;
  const waypoints = points.map((point, i) => {
    travelled += lengths[i];
    return {
      ...point,
      elevationM:
        (machine.elevationM ?? 2) +
        ((plenum.elevationM ?? 2) - (machine.elevationM ?? 2)) *
          (travelled / total),
    };
  });
  const targets = (next.ducts ?? []).filter(
    (duct) => duct.plenumId === plenum.id && duct.terminalId === terminal.id,
  );
  if (!targets.length)
    throw new Error("Il plenum della bocchetta non ha stacchi collegabili.");
  const updated: Project = {
    ...next,
    airTerminals: next.airTerminals.map((item) =>
      item.id === terminal.id ? { ...item, plenumId: plenum.id } : item,
    ),
    ducts: (next.ducts ?? []).map((duct) =>
      targets.some((target) => target.id === duct.id)
        ? {
            ...duct,
            kind,
            shape:
              kind === "flexible"
                ? ("circle" as const)
                : ("rectangle" as const),
            diameterMm: duct.diameterMm ?? plenum.portDiameterMm ?? 160,
            widthMm: kind === "flexible" ? null : section.widthMm,
            heightMm: kind === "flexible" ? null : section.heightMm,
            routing: "manual" as const,
            waypoints,
            decisionOrigin: "manual" as const,
          }
        : duct,
    ),
  };
  const unreachable = (updated.ducts ?? []).some(
    (duct) =>
      targets.some((target) => target.id === duct.id) &&
      ductRoute(updated, duct).length < 2,
  );
  if (unreachable)
    throw new Error("Percorso non realizzabile: sposta curve o plenum.");
  return updated;
}

/**
 * La bocchetta sceglie anche il proprio plenum: un clic sul plenum vale come
 * un clic sulla bocchetta, non serve cercare il simbolo del terminale.
 */
function terminalForDuctEndpoint(project: Project, id: string) {
  return (
    project.airTerminals.find((terminal) => terminal.id === id) ??
    project.airTerminals.find((terminal) =>
      project.plenums.some(
        (plenum) => plenum.id === id && plenum.attachmentId === terminal.id,
      ),
    ) ??
    null
  );
}

/** Un plenum agganciato a una bocchetta non identifica la macchina. */
function systemForDuctEndpoint(project: Project, id: string) {
  const direct = project.hvacSystems.find(
    (system) =>
      system.type === "ducted" &&
      (system.id === id || system.indoorUnits.some((unit) => unit.id === id)),
  );
  if (direct) return direct;
  const plenum = project.plenums.find((item) => item.id === id);
  if (!plenum?.systemId) return null;
  const system = project.hvacSystems.find(
    (item) => item.type === "ducted" && item.id === plenum.systemId,
  );
  if (!system) return null;
  return plenum.attachmentId === undefined ||
    plenum.attachmentId === null ||
    system.indoorUnits.some((unit) => unit.id === plenum.attachmentId)
    ? system
    : null;
}

/**
 * Percorso predefinito fra lo stacco del plenum e quello della macchina: poche
 * pieghe ortogonali, già trascinabili in 3D. Se la proposta fallisce, conserva
 * un tracciato fra i collari da correggere; `null` solo senza attacchi.
 */
function proposedWaypoints(
  project: Project,
  terminal: Project["airTerminals"][number],
  start: RoutePoint,
  end: RoutePoint,
  diameterMm: number,
): RoutePoint[] | null {
  const route = flexibleConnectionRoute(
    project,
    terminal.systemId!,
    terminal,
    start,
    end,
    diameterMm,
  );
  if (route.length > 1) return route.slice(1, -1);
  // Conserva un tracciato modificabile anche quando la proposta geometrica fallisce.
  const leads = flexibleCollarLeads(
    project,
    terminal.systemId!,
    terminal,
    start,
    end,
    diameterMm,
  );
  return leads ? [leads.from, leads.to] : null;
}

/**
 * Crea il canale fra gli estremi scelti in pianta: plenum della bocchetta
 * (primo punto già sullo stacco) e macchina o plenum macchina. Il percorso è
 * calcolato una volta e resta modificabile come percorso manuale.
 */
export function createDuctFromEndpoints(
  project: Project,
  firstId: string,
  secondId: string,
) {
  const firstTerminal = terminalForDuctEndpoint(project, firstId);
  const secondTerminal = terminalForDuctEndpoint(project, secondId);
  if (firstTerminal && secondTerminal)
    throw new Error(
      "Il canale collega il plenum della bocchetta alla macchina, non due bocchette.",
    );
  const terminal = firstTerminal ?? secondTerminal;
  if (!terminal)
    throw new Error(
      "Clicca il plenum della bocchetta (o la bocchetta), poi la macchina.",
    );
  const system =
    systemForDuctEndpoint(project, firstTerminal ? secondId : firstId) ??
    systemForDuctEndpoint(project, secondTerminal ? firstId : secondId);
  if (!system)
    throw new Error(
      "Clicca la macchina (o il suo plenum) per chiudere il canale.",
    );
  if (!system.indoorUnits.length)
    throw new Error(
      "Posiziona la macchina sulla planimetria prima del canale.",
    );
  if (terminal.floorId !== system.indoorUnits[0].floorId)
    throw new Error("Bocchetta e macchina devono stare sullo stesso piano.");
  let next =
    terminal.systemId === system.id
      ? project
      : connectTerminalOnPlan(project, terminal.id, system.id);
  const current = next.airTerminals.find((item) => item.id === terminal.id)!;
  const body = terminalPlenum(next, current);
  if (!body)
    throw new Error(
      "La bocchetta non ha un plenum collegato: crealo con lo strumento Plenum e collegalo, poi traccia il canale.",
    );
  if (
    !machinePlenums(next, system.id).some(
      (plenum) => plenum.use === current.use,
    )
  )
    throw new Error(
      `La macchina non ha ancora il plenum di ${current.use === "return" ? "ripresa" : "mandata"}: crealo con lo strumento Plenum, poi traccia il canale.`,
    );
  if (!machinePlenum(next, system.id, current.use))
    throw new Error(
      "La macchina non ha il plenum di questo lato: verifica l'attacco dichiarato.",
    );
  next = next.plenums.some((plenum) => plenum.id === body.id)
    ? next
    : {
        ...next,
        plenums: [...next.plenums, { ...body, status: "manual" as const }],
      };
  next = {
    ...next,
    airTerminals: next.airTerminals.map((item) =>
      item.id === current.id ? { ...item, plenumId: body.id } : item,
    ),
  };
  next = syncAttachedPlenums(next);
  const plenum = next.plenums.find((item) => item.id === body.id);
  if (!plenum)
    throw new Error("Plenum della bocchetta non disponibile sul piano.");
  const targets = (next.ducts ?? []).filter(
    (duct) => duct.plenumId === plenum.id && duct.terminalId === current.id,
  );
  if (!targets.length)
    throw new Error("Il plenum della bocchetta non ha stacchi collegabili.");
  const ports = attachedPlenumPorts(next, plenum);
  const ducts = (next.ducts ?? []).map((duct) => {
    if (!targets.some((target) => target.id === duct.id)) return duct;
    // Un percorso già tracciato dall'operatore non viene riscritto.
    if (duct.routing === "manual" && duct.waypoints.length) return duct;
    const index = Number(duct.branchId?.split(":").at(-1) ?? 0);
    const start = machineDuctStart(next, system.id, current.id, index);
    const end = ports[index];
    if (!start || !end)
      throw new Error(
        "Percorso non realizzabile: verifica gli stacchi dei due plenum.",
      );
    const diameterMm = duct.diameterMm ?? plenum.portDiameterMm ?? 160;
    const waypoints = proposedWaypoints(next, current, start, end, diameterMm);
    if (!waypoints) return duct;
    return {
      ...duct,
      kind: "flexible" as const,
      shape: "circle" as const,
      diameterMm,
      widthMm: null,
      heightMm: null,
      routing: "manual" as const,
      waypoints,
      decisionOrigin: "manual" as const,
    };
  });
  const updated: Project = { ...next, ducts };
  if (
    targets.some(
      (target) =>
        ductRoute(
          updated,
          updated.ducts!.find((duct) => duct.id === target.id)!,
        ).length < 2,
    )
  )
    throw new Error("Percorso non realizzabile: sposta curve o plenum.");
  return {
    project: updated,
    terminalId: current.id,
    systemId: system.id,
    ductIds: targets.map((target) => target.id),
  };
}

/** Cambia rigido/flessibile mantenendo percorso e diametro dello stacco. */
export function setDuctKind(
  project: Project,
  ductId: string,
  kind: "rigid" | "flexible",
): Project {
  return {
    ...project,
    ducts: (project.ducts ?? []).map((duct) => {
      if (duct.id !== ductId) return duct;
      if (kind === "flexible")
        return {
          ...duct,
          kind,
          shape: "circle" as const,
          diameterMm: duct.diameterMm ?? 100,
          widthMm: null,
          heightMm: null,
        };
      const section =
        duct.widthMm && duct.heightMm
          ? { widthMm: duct.widthMm, heightMm: duct.heightMm }
          : rectangularSection(duct.diameterMm ?? 100);
      return {
        ...duct,
        kind,
        shape: "rectangle" as const,
        widthMm: section.widthMm,
        heightMm: section.heightMm,
      };
    }),
  };
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

/** Save an operator bend point, keeping the existing route shape when it was automatic. */
function nearestRouteSegment(nodes: RoutePoint[], target: Point | RoutePoint) {
  let segment = 0;
  let point: RoutePoint = nodes[0];
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1];
    const vx = b.x - a.x,
      vy = b.y - a.y,
      vz = "elevationM" in target ? b.elevationM - a.elevationM : 0;
    const lengthSquared = vx * vx + vy * vy + vz * vz;
    const t =
      lengthSquared < 1e-12
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((target.x - a.x) * vx +
                (target.y - a.y) * vy +
                ("elevationM" in target
                  ? target.elevationM - a.elevationM
                  : 0) *
                  vz) /
                lengthSquared,
            ),
          );
    const candidate = {
      x: a.x + vx * t,
      y: a.y + vy * t,
      elevationM: a.elevationM + (b.elevationM - a.elevationM) * t,
    };
    const candidateDistance = Math.hypot(
      target.x - candidate.x,
      target.y - candidate.y,
      "elevationM" in target ? target.elevationM - candidate.elevationM : 0,
    );
    if (candidateDistance < distance) {
      distance = candidateDistance;
      segment = i;
      point = candidate;
    }
  }
  return { segment, point };
}

function longestRouteSegment(nodes: RoutePoint[]) {
  let segment = 0;
  let length = -1;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1];
    const candidate = Math.hypot(
      a.x - b.x,
      a.y - b.y,
      a.elevationM - b.elevationM,
    );
    if (candidate > length) {
      length = candidate;
      segment = i;
    }
  }
  const a = nodes[segment],
    b = nodes[segment + 1];
  return {
    segment,
    point: {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      elevationM: (a.elevationM + b.elevationM) / 2,
    },
  };
}

/** Add one bending point; a requested 2D/3D point snaps to the tube centreline. */
export function addDuctWaypoint(
  project: Project,
  ductId: string,
  requested?: Point | RoutePoint,
): { project: Project; index: number } {
  const duct = project.ducts?.find((d) => d.id === ductId);
  if (!duct) return { project, index: -1 };
  if (duct.locked) throw new Error("Sblocca il canale prima di modificarlo.");
  const route = ductRoute(project, duct);
  if (route.length < 2) return { project, index: -1 };
  // Conserva il percorso proposto: semplificarlo può far attraversare il plenum dal retro.
  const interior =
    duct.routing === "manual" ? duct.waypoints : route.slice(1, -1);
  const nodes: RoutePoint[] = [route[0], ...interior, route.at(-1)!];
  const { segment, point } = requested
    ? nearestRouteSegment(nodes, requested)
    : longestRouteSegment(nodes);
  const waypoints = [
    ...interior.slice(0, segment),
    point,
    ...interior.slice(segment),
  ];
  return {
    project: {
      ...project,
      ducts: project.ducts?.map((d) =>
        d.id === ductId
          ? {
              ...d,
              routing: "manual",
              decisionOrigin: "manual",
              waypoints,
            }
          : d,
      ),
    },
    index: segment,
  };
}

export function removeDuctWaypoint(
  project: Project,
  ductId: string,
  index: number,
): Project {
  return {
    ...project,
    ducts: project.ducts?.map((d) =>
      d.id === ductId && index >= 0 && index < d.waypoints.length && !d.locked
        ? {
            ...d,
            routing: "manual",
            decisionOrigin: "manual",
            waypoints: d.waypoints.filter((_, i) => i !== index),
          }
        : d,
    ),
  };
}

/** In pianta cambia solo X/Y; il trascinamento 3D aggiorna anche la quota. */
export function moveDuctWaypoint(
  project: Project,
  ductId: string,
  index: number,
  position: Point | RoutePoint,
): Project {
  return {
    ...project,
    ducts: project.ducts?.map((duct) =>
      duct.id === ductId &&
      !duct.locked &&
      index >= 0 &&
      index < duct.waypoints.length
        ? {
            ...duct,
            routing: "manual",
            decisionOrigin: "manual",
            waypoints: duct.waypoints.map((point, i) =>
              i === index ? { ...point, ...position } : point,
            ),
          }
        : duct,
    ),
  };
}
