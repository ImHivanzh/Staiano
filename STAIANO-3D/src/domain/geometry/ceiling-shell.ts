import { ShapeUtils, Vector2 } from "three";
import type { Point, Project, Room } from "@/schemas/project";
import { ceilingBandPolygon, roofHeightAt, roofPlanes } from "./ceilings";
import { onSegment } from "./primitives";

/** The same finite roof and band surfaces feed rendering and physical checks. */
export function ceilingShellPositions(
  project: Project,
  room: Room,
  polygon: Point[],
  bottom?: number,
  bandId?: string,
) {
  const positions: number[] = [];
  const neighbors = bandId
    ? (room.ceilingBands ?? [])
        .filter((band) => band.id !== bandId)
        .map((band) => ({
          polygon: ceilingBandPolygon(project, room, band),
          bottom: band.elevationM,
        }))
    : [];
  const topAt = (p: Point) =>
    bottom !== undefined && room.ceilingHeightM !== null
      ? room.ceilingHeightM
      : roofHeightAt(project, room, p);
  const triangle = (
    a: Point,
    ah: number,
    b: Point,
    bh: number,
    c: Point,
    ch: number,
  ) => positions.push(a.x, ah, a.y, b.x, bh, b.y, c.x, ch, c.y);
  for (const plane of roofPlanes(project, room, polygon)) {
    const faces = ShapeUtils.triangulateShape(
      plane.map((p) => new Vector2(p.x, p.y)),
      [],
    );
    for (const [ia, ib, ic] of faces) {
      const a = plane[ia],
        b = plane[ib],
        c = plane[ic];
      triangle(a, topAt(a), b, topAt(b), c, topAt(c));
      if (bottom !== undefined) triangle(c, bottom, b, bottom, a, bottom);
    }
    for (let i = 0; i < plane.length; i++) {
      const a = plane[i],
        b = plane[(i + 1) % plane.length];
      if (
        !polygon.some(
          (p, j) =>
            onSegment(a, p, polygon[(j + 1) % polygon.length]) &&
            onSegment(b, p, polygon[(j + 1) % polygon.length]),
        )
      )
        continue;
      const low = bottom ?? room.heightM;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        lengthSq = dx * dx + dy * dy;
      if (lengthSq < 1e-16) continue;
      const cuts = [0, 1];
      for (const neighbor of neighbors)
        for (const point of neighbor.polygon)
          if (onSegment(point, a, b))
            cuts.push(
              Math.max(
                0,
                Math.min(
                  1,
                  ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq,
                ),
              ),
            );
      const steps = [...new Set(cuts)].sort((a, b) => a - b);
      const at = (t: number) =>
        t === 0 ? a : t === 1 ? b : { x: a.x + dx * t, y: a.y + dy * t };
      for (let j = 1; j < steps.length; j++) {
        if (steps[j] - steps[j - 1] < 1e-10) continue;
        const from = at(steps[j - 1]),
          to = at(steps[j]),
          mid = at((steps[j - 1] + steps[j]) / 2);
        const adjacent = neighbors.filter((neighbor) =>
          neighbor.polygon.some((point, k) =>
            onSegment(
              mid,
              point,
              neighbor.polygon[(k + 1) % neighbor.polygon.length],
            ),
          ),
        );
        const high = (point: Point) =>
          Math.min(
            topAt(point),
            ...adjacent.map((neighbor) => neighbor.bottom),
          );
        const ah = high(from),
          bh = high(to);
        // Shared voids have no internal skin; unequal undersides retain their exposed step.
        if (adjacent.length && Math.max(ah, bh) <= low + 1e-8) continue;
        triangle(from, low, to, low, from, ah);
        triangle(to, low, to, bh, from, ah);
      }
    }
  }
  return positions;
}
