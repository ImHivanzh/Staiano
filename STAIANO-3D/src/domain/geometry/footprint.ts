import type { Point, Room } from "@/schemas/project";
import {
  add,
  scale,
  pointInPolygon,
  lineIntersection,
  onSegment,
  samePoint,
  projection,
  distance,
} from "./primitives";
export function nearestFootprintEdge(
  device: {
    position: Point;
    widthMm: number;
    depthMm: number;
    rotation: number;
  },
  target: Point,
): Point {
  const corners = footprintCorners(
    device.position,
    device.widthMm / 1000,
    device.depthMm / 1000,
    device.rotation,
  );
  return corners
    .map((corner, i) => projection(target, corner, corners[(i + 1) % 4]))
    .sort((a, b) => distance(a, target) - distance(b, target))[0];
}
export function footprintCorners(
  position: Point,
  widthM: number,
  heightM: number,
  rotation: number,
): Point[] {
  const x = { x: Math.cos(rotation), y: Math.sin(rotation) },
    y = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) =>
    add(
      add(position, scale(x, (sx * widthM) / 2)),
      scale(y, (sy * heightM) / 2),
    ),
  );
}
export function footprintInsideRoom(
  room: Room,
  position: Point,
  widthM: number,
  heightM: number,
  rotation: number,
): boolean {
  const corners = footprintCorners(position, widthM, heightM, rotation);
  if (!corners.every((p) => pointInPolygon(p, room.polygon))) return false;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < room.polygon.length; j++) {
      const a = corners[i],
        b = corners[(i + 1) % 4],
        c = room.polygon[j],
        d = room.polygon[(j + 1) % room.polygon.length],
        hit = lineIntersection(a, b, c, d);
      if (
        hit &&
        onSegment(hit, a, b) &&
        onSegment(hit, c, d) &&
        ![a, b, c, d].some((p) => samePoint(p, hit))
      )
        return false;
    }
  return true;
}
export function convexFootprintsOverlap(a: Point[], b: Point[]): boolean {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        axis = { x: -(q.y - p.y), y: q.x - p.x };
      const project = (points: Point[]) =>
          points.map((v) => v.x * axis.x + v.y * axis.y),
        ap = project(a),
        bp = project(b);
      if (
        Math.max(...ap) <= Math.min(...bp) + 1e-7 ||
        Math.max(...bp) <= Math.min(...ap) + 1e-7
      )
        return false;
    }
  return true;
}
