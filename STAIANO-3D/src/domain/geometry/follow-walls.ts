import type { Point, Project, Wall } from "@/schemas/project";
import { distance, add, scale, subtract } from "./primitives";
/** Preserve placement offsets on walls that move, rotate or change thickness. */
export function followWallTransforms(
  project: Project,
  newWalls: Wall[],
): Project {
  const pose = <
    T extends { wallId: string | null; position: Point; rotation: number },
  >(
    item: T,
  ): T => {
    const before = project.walls.find((w) => w.id === item.wallId),
      after = newWalls.find((w) => w.id === item.wallId);
    if (!before || !after) return item;
    const oldLength = distance(before.start, before.end),
      newLength = distance(after.start, after.end);
    if (oldLength < 1e-7 || newLength < 1e-7) return item;
    const oldDirection = scale(
        subtract(before.end, before.start),
        1 / oldLength,
      ),
      newDirection = scale(subtract(after.end, after.start), 1 / newLength),
      offset = subtract(item.position, before.start),
      along = offset.x * oldDirection.x + offset.y * oldDirection.y,
      normal = offset.x * -oldDirection.y + offset.y * oldDirection.x;
    const newNormal =
      normal + (Math.sign(normal) * (after.thickness - before.thickness)) / 2;
    return {
      ...item,
      position: add(
        add(after.start, scale(newDirection, along)),
        scale({ x: -newDirection.y, y: newDirection.x }, newNormal),
      ),
      rotation:
        item.rotation +
        Math.atan2(newDirection.y, newDirection.x) -
        Math.atan2(oldDirection.y, oldDirection.x),
    };
  };
  return {
    ...project,
    walls: newWalls,
    radiators: project.radiators.map(pose),
    fanCoils: project.fanCoils?.map((u) =>
      u.mounting === "wall" ? pose(u) : u,
    ),
    airTerminals: project.airTerminals.map((t) =>
      t.mounting === "wall" ? pose(t) : t,
    ),
    hvacSystems: project.hvacSystems.map((s) => ({
      ...s,
      indoorUnits: s.indoorUnits.map(pose),
    })),
  };
}
