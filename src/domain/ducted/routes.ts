import type { Duct, Plenum, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import { placedPlenumGeometry } from "./placement";

export type RoutePoint = Point & { elevationM: number };
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
    const automatic = [
      { x: start.x, y: end.y, elevationM: start.elevationM },
      { x: end.x, y: end.y, elevationM: start.elevationM },
    ];
    return [
      start,
      ...(duct.routing === "manual" ? duct.waypoints : automatic),
      end,
    ];
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
  return [start, ...duct.waypoints, plenumLocalToPlan(plenum, [0, 0, 0])];
}

export function generateDuctRoutes(
  project: Project,
  systemId: string,
): Project {
  const plenum = project.plenums.find((pl) => pl.systemId === systemId);
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
