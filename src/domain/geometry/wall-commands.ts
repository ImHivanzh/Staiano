import type { Point, Project } from "@/schemas/project";
import { newId, recomputeProject } from "@/domain/project";
import { add, cross, distance, samePoint, scale, subtract } from "./primitives";
import { followWallTransforms } from "./follow-walls";

export function setWallEndpoints(
  project: Project,
  id: string,
  start: Point,
  end: Point,
) {
  const wall = project.walls.find((w) => w.id === id);
  if (!wall) throw new Error("Parete inesistente.");
  if (wall.locked) throw new Error("Sbloccare la parete.");
  if (distance(start, end) < 0.05) throw new Error("Parete minima 5 cm.");
  const walls = project.walls.map((w) =>
    w.floorId !== wall.floorId
      ? w
      : {
          ...w,
          start: samePoint(w.start, wall.start)
            ? start
            : samePoint(w.start, wall.end)
              ? end
              : w.start,
          end: samePoint(w.end, wall.start)
            ? start
            : samePoint(w.end, wall.end)
              ? end
              : w.end,
        },
  );
  return recomputeProject(followWallTransforms(project, walls));
}

export function splitWall(project: Project, id: string, offsetM: number) {
  const wall = project.walls.find((w) => w.id === id);
  if (!wall || wall.locked) throw new Error("Parete inesistente o bloccata.");
  const length = distance(wall.start, wall.end);
  if (!Number.isFinite(offsetM) || offsetM < 0.05 || length - offsetM < 0.05)
    throw new Error("Lasciare almeno 5 cm in entrambi i segmenti.");
  const middle = add(
    wall.start,
    scale(subtract(wall.end, wall.start), offsetM / length),
  );
  const secondId = newId();
  const pointFor = (p: Point) => {
    const v = scale(subtract(wall.end, wall.start), 1 / length),
      r = subtract(p, wall.start);
    return r.x * v.x + r.y * v.y >= offsetM ? secondId : id;
  };
  const device = <T extends { wallId: string | null; position: Point }>(
    d: T,
  ): T => (d.wallId === id ? { ...d, wallId: pointFor(d.position) } : d);
  return recomputeProject({
    ...project,
    walls: [
      ...project.walls.map((w) => (w.id === id ? { ...w, end: middle } : w)),
      { ...wall, id: secondId, start: middle },
    ],
    openings: project.openings.map((o) =>
      o.wallId === id && o.offsetM >= offsetM
        ? { ...o, wallId: secondId, offsetM: o.offsetM - offsetM }
        : o,
    ),
    radiators: project.radiators.map(device),
    airTerminals: project.airTerminals.map(device),
    hvacSystems: project.hvacSystems.map((s) => ({
      ...s,
      indoorUnits: s.indoorUnits.map(device),
    })),
  });
}

export function mergeWallSegments(
  project: Project,
  firstId: string,
  secondId: string,
) {
  const a = project.walls.find((w) => w.id === firstId),
    b = project.walls.find((w) => w.id === secondId);
  if (
    !a ||
    !b ||
    a.floorId !== b.floorId ||
    a.locked ||
    b.locked ||
    a.thickness !== b.thickness ||
    a.type !== b.type
  )
    throw new Error("Selezionare due segmenti compatibili e sbloccati.");
  const joint = [a.start, a.end].find(
    (p) => samePoint(p, b.start) || samePoint(p, b.end),
  );
  if (
    !joint ||
    Math.abs(cross(subtract(a.end, a.start), subtract(b.end, b.start))) > 1e-6
  )
    throw new Error("Unione disponibile per segmenti collineari contigui.");
  if (
    project.walls.some(
      (w) =>
        w.id !== a.id &&
        w.id !== b.id &&
        w.floorId === a.floorId &&
        (samePoint(w.start, joint) || samePoint(w.end, joint)),
    )
  )
    throw new Error("Giunzione con altri muri: mantenere i segmenti separati.");
  const start = samePoint(a.start, joint) ? a.end : a.start,
    end = samePoint(b.start, joint) ? b.end : b.start;
  const direction = scale(subtract(end, start), 1 / distance(start, end));
  const device = <T extends { wallId: string | null }>(d: T): T =>
    d.wallId === b.id ? { ...d, wallId: a.id } : d;
  const openings = project.openings.map((o) => {
    const old = [a, b].find((w) => w.id === o.wallId);
    if (!old) return o;
    const v = scale(
      subtract(old.end, old.start),
      1 / distance(old.start, old.end),
    );
    const p = add(old.start, scale(v, o.offsetM));
    const r = subtract(p, start),
      reversed = v.x * direction.x + v.y * direction.y < 0;
    return {
      ...o,
      wallId: a.id,
      offsetM:
        r.x * direction.x + r.y * direction.y - (reversed ? o.widthM : 0),
    };
  });
  return recomputeProject({
    ...project,
    walls: project.walls
      .filter((w) => w.id !== b.id)
      .map((w) => (w.id === a.id ? { ...w, start, end } : w)),
    openings,
    radiators: project.radiators.map(device),
    airTerminals: project.airTerminals.map(device),
    hvacSystems: project.hvacSystems.map((s) => ({
      ...s,
      indoorUnits: s.indoorUnits.map(device),
    })),
  });
}
