import type { Point, Project } from "@/schemas/project";
import { recomputeProject } from "@/domain/project";
import { add, distance, scale, subtract } from "./primitives";

/** Recalibrate measured plan coordinates; physical product dimensions stay in mm. */
export function rescaleFloor(
  project: Project,
  floorId: string,
  factor: number,
  origin: Point,
): Project {
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    factor > 1000 ||
    ![origin.x, origin.y].every(Number.isFinite)
  )
    throw new Error("Rapporto di calibrazione non valido.");
  const floor = project.floors.find((f) => f.id === floorId);
  if (!floor?.background)
    throw new Error("Sfondo planimetria necessario per ricalibrare.");
  const transform = (point: Point) =>
    add(origin, scale(subtract(point, origin), factor));
  const walls = project.walls.map((wall) =>
    wall.floorId === floorId
      ? { ...wall, start: transform(wall.start), end: transform(wall.end) }
      : wall,
  );
  const pose = <
    T extends { floorId: string; wallId: string | null; position: Point },
  >(
    item: T,
  ): T => {
    if (item.floorId !== floorId) return item;
    const wall = project.walls.find((w) => w.id === item.wallId);
    if (!wall) return { ...item, position: transform(item.position) };
    const length = distance(wall.start, wall.end);
    if (length < 1e-7) return item;
    const tangent = scale(subtract(wall.end, wall.start), 1 / length);
    const offset = subtract(item.position, wall.start);
    const along = (offset.x * tangent.x + offset.y * tangent.y) * factor;
    const normal = offset.x * -tangent.y + offset.y * tangent.x;
    return {
      ...item,
      position: add(
        add(transform(wall.start), scale(tangent, along)),
        scale({ x: -tangent.y, y: tangent.x }, normal),
      ),
    };
  };
  return recomputeProject({
    ...project,
    walls,
    floors: project.floors.map((f) =>
      f.id === floorId && f.background
        ? {
            ...f,
            scaleVerified: true,
            background: {
              ...f.background,
              metersPerPixel: f.background.metersPerPixel * factor,
            },
          }
        : f,
    ),
    rooms: project.rooms.map((room) =>
      room.floorId === floorId
        ? {
            ...room,
            polygon: room.polygon.map(transform),
            centroid: transform(room.centroid),
          }
        : room,
    ),
    radiators: project.radiators.map(pose),
    airTerminals: project.airTerminals.map(pose),
    hvacSystems: project.hvacSystems.map((system) => ({
      ...system,
      indoorUnits: system.indoorUnits.map(pose),
    })),
  });
}
