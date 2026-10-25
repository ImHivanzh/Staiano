import type { Point, Room, Wall } from "@/schemas/project";
import { add, distance, projection, scale, subtract } from "./primitives";
import { drywallSideForRoom } from "./drywall-sides";
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
  const span =
    segments
      .map((e) => ({ ...e, lengthM: distance(e.start, e.end) }))
      .sort((a, b) => b.lengthM - a.lengthM)[0] ?? null;
  const offset = drywallSideForRoom(wall, room.id)?.offsetM ?? 0;
  if (!span || offset <= 0) return span;
  const dx = (-(span.end.y - span.start.y) / span.lengthM) * offset;
  const dy = ((span.end.x - span.start.x) / span.lengthM) * offset;
  return {
    ...span,
    start: { x: span.start.x + dx, y: span.start.y + dy },
    end: { x: span.end.x + dx, y: span.end.y + dy },
  };
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
/**
 * Centro di un corpo ad incasso: la faccia anteriore resta a filo della faccia
 * interna della parete (2 mm di gola), il resto del corpo va nella muratura o
 * nella controparete.
 */
export function positionRecessedAlongRoomWall(
  room: Room,
  wall: Wall,
  offsetM: number,
  depthM: number,
): Point {
  const span = roomWallSpan(room, wall);
  if (!span)
    throw new Error("Parete non associata al contorno interno stanza.");
  const v = scale(subtract(span.end, span.start), 1 / span.lengthM);
  const normal = { x: -v.y, y: v.x };
  return add(
    add(span.start, scale(v, offsetM)),
    scale(normal, -(depthM / 2 - 0.002)),
  );
}
