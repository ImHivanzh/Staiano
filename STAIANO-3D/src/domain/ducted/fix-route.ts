import type { Project } from "@/schemas/project";
import { validateProject } from "../validation";
import { addDuctWaypoint, ductRoute, type RoutePoint } from "./routes";

export type DuctFix = {
  project: Project;
  /** Problemi del canale prima e dopo la correzione. */
  before: number;
  after: number;
};

const problemCount = (project: Project, ductId: string) =>
  validateProject(project).filter(
    (check) => check.status !== "valid" && check.entityId === ductId,
  ).length;

/**
 * Cerca un percorso senza problemi per il canale: prima il tracciato
 * predefinito, poi un punto intermedio spostato di lato e di quota.
 * Se nessun candidato migliora, restituisce il progetto invariato.
 */
export function fixDuctRoute(project: Project, ductId: string): DuctFix {
  const duct = project.ducts?.find((item) => item.id === ductId);
  if (!duct) throw new Error("Canale non trovato.");
  if (duct.locked) throw new Error("Sblocca il canale prima di correggerlo.");
  const before = problemCount(project, ductId);
  const withDuct = (changes: Partial<typeof duct>): Project => ({
    ...project,
    ducts: project.ducts?.map((item) =>
      item.id === ductId ? { ...item, ...changes } : item,
    ),
  });
  const reset = withDuct({
    routing: "orthogonal",
    waypoints: [],
    decisionOrigin: "suggested",
  });
  const candidates: Project[] = [reset];
  const base = addDuctWaypoint(reset, ductId);
  const route = ductRoute(reset, duct);
  if (base.index >= 0 && route.length >= 2) {
    const placed = base.project.ducts!.find((item) => item.id === ductId)!;
    const middle = placed.waypoints[base.index];
    const start = route[0];
    const end = route.at(-1)!;
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const side = {
      x: -(end.y - start.y) / length,
      y: (end.x - start.x) / length,
    };
    // shortcut: 12 candidati fissi, non un vero pathfinding; per ostacoli complessi serve il tracciato a mano.
    for (const lateral of [0, 0.5, -0.5, 1, -1])
      for (const rise of [0, 0.2, -0.2]) {
        if (!lateral && !rise) continue;
        const point: RoutePoint = {
          x: middle.x + side.x * lateral,
          y: middle.y + side.y * lateral,
          elevationM: middle.elevationM + rise,
        };
        candidates.push({
          ...base.project,
          ducts: base.project.ducts!.map((item) =>
            item.id === ductId
              ? {
                  ...item,
                  waypoints: item.waypoints.map((w, i) =>
                    i === base.index ? point : w,
                  ),
                }
              : item,
          ),
        });
      }
  }
  let best = { project, count: before };
  for (const candidate of candidates) {
    const count = problemCount(candidate, ductId);
    if (count < best.count) best = { project: candidate, count };
    if (!count) break;
  }
  return { project: best.project, before, after: best.count };
}
