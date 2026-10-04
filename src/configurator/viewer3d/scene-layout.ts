import type { Room, Wall } from "@/schemas/project";
import { bounds } from "@/domain/geometry/primitives";

export type SceneFrame = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  base?: number;
};

export function sceneFrame(
  walls: Wall[],
  rooms: Room[],
  defaultHeight: number,
): SceneFrame {
  const box = bounds(walls.flatMap((wall) => [wall.start, wall.end]));
  const padding = Math.max(0.1, ...walls.map((wall) => wall.thickness / 2));
  return {
    minX: box.minX - padding,
    maxX: box.maxX + padding,
    minZ: box.minY - padding,
    maxZ: box.maxY + padding,
    height: Math.max(
      defaultHeight,
      ...rooms.map((room) => room.heightM),
      ...walls.map((wall) => wall.height ?? 0),
    ),
  };
}

/** Cut the near envelope, while retaining the far walls that communicate real height. */
export function cameraCutWalls(
  walls: Wall[],
  rooms: Room[],
  camera: { x: number; z: number },
  top: boolean,
): Set<string> {
  const ids = new Set<string>();
  const box = bounds(walls.flatMap((wall) => [wall.start, wall.end]));
  for (const wall of walls) {
    const neighbours = rooms.filter((room) => room.wallIds.includes(wall.id));
    if (top || neighbours.length > 1) {
      ids.add(wall.id);
      continue;
    }
    const midpoint = {
      x: (wall.start.x + wall.end.x) / 2,
      z: (wall.start.y + wall.end.y) / 2,
    };
    const inside = neighbours[0]?.centroid ?? {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
    };
    const outwardX = midpoint.x - inside.x,
      outwardZ = midpoint.z - inside.y;
    const facing =
      outwardX * (camera.x - midpoint.x) + outwardZ * (camera.z - midpoint.z);
    if (facing > 0.02) ids.add(wall.id);
  }
  return ids;
}
