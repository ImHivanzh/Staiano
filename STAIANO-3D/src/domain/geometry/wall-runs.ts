import type { Point, Project, Wall } from "@/schemas/project";
import { distance, samePoint, scale, subtract } from "./primitives";
import { roomWallSpan } from "./placement";
import { wallMeasuredLength, type DimensionMode } from "./dimensions";

/** Oltre questa distanza (m) due assi non sono considerati la stessa retta. */
const AXIS_TOLERANCE_M = 1e-3;
/** Seno massimo fra due direzioni perché i muri siano collineari. */
const COLLINEAR_TOLERANCE = 1e-3;

export type WallRun = {
  /** Segmenti della fila, ordinati dall'estremo iniziale a quello finale. */
  walls: Wall[];
  start: Point;
  end: Point;
  floorId: string;
};

function unitDirection(a: Point, b: Point): Point | null {
  const length = distance(a, b);
  if (length < 1e-9) return null;
  return scale(subtract(b, a), 1 / length);
}

function onSameAxis(a: Wall, b: Wall): boolean {
  const first = unitDirection(a.start, a.end),
    second = unitDirection(b.start, b.end);
  if (!first || !second) return false;
  const sin =
    first.x * second.y - first.y * second.x;
  if (Math.abs(sin) > COLLINEAR_TOLERANCE) return false;
  // Distanza del secondo asse dalla retta del primo.
  const offset = subtract(b.start, a.start);
  return Math.abs(first.x * offset.y - first.y * offset.x) <= AXIS_TOLERANCE_M;
}

/**
 * Fila massima di muri adiacenti sullo stesso asse. Un muro spezzato da una
 * porta o da una divisione resta una sola misura agli effetti delle quote: i
 * segmenti sono considerati insieme. I muri curvi restano indipendenti.
 */
export function wallRun(project: Project, wallId: string): WallRun | null {
  const wall = project.walls.find((item) => item.id === wallId);
  if (!wall) return null;
  if (wall.curveId)
    return {
      walls: [wall],
      start: wall.start,
      end: wall.end,
      floorId: wall.floorId,
    };
  const direction = unitDirection(wall.start, wall.end);
  if (!direction) return null;
  const candidates = project.walls.filter(
    (item) =>
      item.floorId === wall.floorId && item.id !== wall.id && !item.curveId,
  );
  const used = new Set([wall.id]);
  const chain = (from: Point, sign: 1 | -1) => {
    const walls: Wall[] = [];
    let point = from;
    for (let guard = 0; guard < candidates.length + 1; guard++) {
      const next = candidates.find((item) => {
        if (used.has(item.id) || !onSameAxis(wall, item)) return false;
        if (!samePoint(item.start, point) && !samePoint(item.end, point))
          return false;
        const far = samePoint(item.start, point) ? item.end : item.start;
        const toward = unitDirection(point, far);
        return (
          !!toward &&
          (toward.x * direction.x + toward.y * direction.y) * sign > 0.5
        );
      });
      if (!next) break;
      used.add(next.id);
      const far = samePoint(next.start, point) ? next.end : next.start;
      walls.push(next);
      point = far;
    }
    return { walls, point };
  };
  const before = chain(wall.start, -1),
    after = chain(wall.end, 1);
  return {
    walls: [...before.walls.toReversed(), wall, ...after.walls],
    start: before.point,
    end: after.point,
    floorId: wall.floorId,
  };
}

/**
 * Lunghezza della fila sotto la modalità di quotatura attiva. Interna ed
 * esterna considerano solo le facce agli estremi della fila: le giunzioni
 * intermedie fra segmenti collineari non riducono la misura.
 */
export function wallRunMeasuredLength(
  project: Project,
  wallId: string,
  mode: DimensionMode = "internal",
): number {
  const run = wallRun(project, wallId);
  if (!run) return 0;
  if (run.walls.length === 1) return wallMeasuredLength(project, run.walls[0], mode);
  const axis = distance(run.start, run.end);
  if (axis < 1e-9) return 0;
  if (mode === "axis") return axis;
  if (mode === "internal") {
    let best = Infinity;
    for (const room of project.rooms) {
      if (
        room.geometryStatus !== "closed" ||
        !run.walls.every((item) => room.wallIds.includes(item.id))
      )
        continue;
      const spans = run.walls.map((item) => roomWallSpan(room, item));
      if (spans.some((span) => !span)) continue;
      best = Math.min(
        best,
        spans.reduce((sum, span) => sum + span!.lengthM, 0),
      );
    }
    if (Number.isFinite(best)) return best;
    // Nessuna stanza racchiude tutta la fila: si usano le facce degli estremi.
  }
  const direction = unitDirection(run.start, run.end);
  if (!direction) return 0;
  let delta = 0;
  for (const end of [run.start, run.end]) {
    let contribution = 0;
    for (const other of project.walls) {
      if (other.floorId !== run.floorId) continue;
      if (run.walls.some((item) => item.id === other.id)) continue;
      if (!samePoint(other.start, end) && !samePoint(other.end, end)) continue;
      const otherDirection = unitDirection(other.start, other.end);
      if (!otherDirection) continue;
      const sin = Math.abs(
        direction.x * otherDirection.y - direction.y * otherDirection.x,
      );
      if (sin < 0.2) continue;
      contribution = Math.max(contribution, other.thickness / 2 / sin);
    }
    delta += contribution;
  }
  const sign = mode === "internal" ? -1 : 1;
  return Math.max(0.01, axis + sign * delta);
}
