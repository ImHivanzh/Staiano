import type { Room, Wall } from "@/schemas/project";
import { bounds } from "@/domain/geometry/primitives";
import type { OutdoorUnitLike } from "@/domain/hydronic/placement";

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
  outdoorUnits: OutdoorUnitLike[] = [],
): SceneFrame {
  const box = bounds(walls.flatMap((wall) => [wall.start, wall.end]));
  const padding = Math.max(0.1, ...walls.map((wall) => wall.thickness / 2));
  const frame: SceneFrame = {
    minX: box.minX - padding,
    maxX: box.maxX + padding,
    minZ: box.minY - padding,
    maxZ: box.maxY + padding,
    height: Math.max(
      defaultHeight,
      ...rooms.map((room) => room.roof?.ridgeHeightM ?? room.heightM),
      ...walls.map((wall) => wall.height ?? 0),
    ),
  };
  for (const unit of outdoorUnits) {
    const radius = Math.hypot(unit.widthMm, unit.depthMm) / 2000 + 0.3;
    frame.minX = Math.min(frame.minX, unit.position.x - radius);
    frame.maxX = Math.max(frame.maxX, unit.position.x + radius);
    frame.minZ = Math.min(frame.minZ, unit.position.y - radius);
    frame.maxZ = Math.max(frame.maxZ, unit.position.y + radius);
    frame.height = Math.max(
      frame.height,
      unit.elevationM + unit.heightMm / 2000,
    );
  }
  return frame;
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
