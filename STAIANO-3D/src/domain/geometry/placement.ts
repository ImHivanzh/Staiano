import type { Point, Room, Wall } from "@/schemas/project";
import { add, distance, projection, scale, subtract } from "./primitives";
/** Net usable face, independent of wall axis and neighboring wall thickness. */
export function roomWallSpan(
  room: Room,
  wall: Wall,
): { start: Point; end: Point; lengthM: number } | null {
  const segments = room.polygon
    .map((a, i) => ({
      start: a,
      end: room.polygon[(i + 1) % room.polygon.length],
    }))
    .filter((e) =>
      [e.start, e.end].every(
        (p) =>
          Math.abs(
            distance(p, projection(p, wall.start, wall.end)) -
              wall.thickness / 2,
          ) < 1e-4,
      ),
    );
  return (
    segments
      .map((e) => ({ ...e, lengthM: distance(e.start, e.end) }))
      .sort((a, b) => b.lengthM - a.lengthM)[0] ?? null
  );
}
export function positionAlongRoomWall(
  room: Room,
  wall: Wall,
  offsetM: number,
  depthM: number,
): Point {
  const span = roomWallSpan(room, wall);
  if (!span)
    throw new Error("Parete non associata al contorno interno stanza.");
  const v = scale(subtract(span.end, span.start), 1 / span.lengthM);
  // polygon is CCW in metric coordinates, so interior is on its left.
  return add(
    add(span.start, scale(v, offsetM)),
    scale({ x: -v.y, y: v.x }, depthM / 2 + 0.02),
  );
}
