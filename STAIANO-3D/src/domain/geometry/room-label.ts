import type { Point } from "@/schemas/project";
import {
  bounds,
  centroid,
  distance,
  pointInPolygon,
  projection,
} from "./primitives";

/** A concave room's area centroid can fall in a neighbouring room. */
export function roomLabelPoint(polygon: Point[]): Point {
  if (polygon.length < 3) return polygon[0] ?? { x: 0, y: 0 };
  const box = bounds(polygon);
  const width = box.maxX - box.minX,
    height = box.maxY - box.minY;
  if (width <= 0 || height <= 0) return polygon[0];
  const clearance = (point: Point) => {
    const nearest = Math.min(
      ...polygon.map((a, i) =>
        distance(
          point,
          projection(point, a, polygon[(i + 1) % polygon.length]),
        ),
      ),
    );
    return (pointInPolygon(point, polygon) ? 1 : -1) * nearest;
  };
  const cell = (x: number, y: number, half: number) => {
    const d = clearance({ x, y });
    return { x, y, half, d, max: d + half * Math.SQRT2 };
  };
  const center = centroid(polygon);
  let best = cell(center.x, center.y, 0);
  // Seed inside even when the corridor is narrower than the search precision.
  if (best.d <= 0) {
    const y = (box.minY + box.maxY) / 2;
    const crossings = polygon
      .flatMap((a, i) => {
        const b = polygon[(i + 1) % polygon.length];
        return a.y > y !== b.y > y
          ? [a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)]
          : [];
      })
      .sort((a, b) => a - b);
    for (let i = 1; i < crossings.length; i += 2) {
      const inside = cell((crossings[i - 1] + crossings[i]) / 2, y, 0);
      if (inside.d > best.d) best = inside;
    }
  }
  const initial = cell(
    (box.minX + box.maxX) / 2,
    (box.minY + box.maxY) / 2,
    Math.max(width, height) / 2,
  );
  if (initial.d > best.d) best = initial;
  const queue = [initial],
    precision = Math.min(width, height) / 100;
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const candidate = queue.pop()!;
    if (candidate.d > best.d) best = candidate;
    if (candidate.max - best.d <= precision) continue;
    const half = candidate.half / 2;
    for (const dx of [-half, half])
      for (const dy of [-half, half])
        queue.push(cell(candidate.x + dx, candidate.y + dy, half));
  }
  return { x: best.x, y: best.y };
}

export interface LabelObstacle {
  x: number;
  y: number;
  /** Mezza diagonale dell'ingombro in metri. */
  radius: number;
}

/**
 * Sposta l'etichetta dal punto ideale al punto libero più vicino quando un apparecchio
 * la coprirebbe. Il riquadro è approssimato in metri: basta a evitare il testo sovrapposto.
 */
export function roomLabelPointAvoiding(
  polygon: Point[],
  obstacles: readonly LabelObstacle[],
  halfWidth = 0.65,
  halfHeight = 0.4,
): Point {
  const base = roomLabelPoint(polygon);
  const hits = (p: Point) =>
    obstacles.some(
      (o) =>
        Math.abs(o.x - p.x) < halfWidth + o.radius &&
        Math.abs(o.y - p.y) < halfHeight + o.radius,
    );
  if (!hits(base)) return base;
  const fits = (p: Point) =>
    [-1, 1].every((sx) =>
      [-1, 1].every((sy) =>
        pointInPolygon(
          { x: p.x + sx * halfWidth, y: p.y + sy * halfHeight },
          polygon,
        ),
      ),
    );
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (let dx = -3; dx <= 3; dx += 0.2)
    for (let dy = -3; dy <= 3; dy += 0.2) {
      const p = { x: base.x + dx, y: base.y + dy };
      const d = Math.hypot(dx, dy);
      if (d < bestDistance && fits(p) && !hits(p)) {
        best = p;
        bestDistance = d;
      }
    }
  return best ?? base;
}
