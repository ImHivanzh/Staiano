import type { Point, Project } from "@/schemas/project";
import { footprintCorners } from "./footprint";
import {
  distance,
  lineIntersection,
  onSegment,
  pointInPolygon,
  projection,
  samePoint,
} from "./primitives";

/** Partition walls belong to the building; routing through the exterior does not. */
export function floorRoutingPolygons(
  project: Project,
  floorId: string,
): Point[][] {
  return [
    ...project.rooms
      .filter((r) => r.floorId === floorId && r.geometryStatus === "closed")
      .map((r) => r.polygon),
    ...project.walls
      .filter((w) => w.floorId === floorId)
      .map((w) =>
        footprintCorners(
          { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 },
          distance(w.start, w.end),
          w.thickness,
          Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x),
        ),
      ),
  ];
}

export function nearestIndoorPoint(
  project: Project,
  floorId: string,
  point: Point,
): Point | null {
  const candidates = project.rooms
    .filter((r) => r.floorId === floorId && r.geometryStatus === "closed")
    .flatMap((r) =>
      r.polygon.map((p, i) =>
        projection(point, p, r.polygon[(i + 1) % r.polygon.length]),
      ),
    );
  return (
    candidates.toSorted((a, b) => distance(point, a) - distance(point, b))[0] ??
    null
  );
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// Il piano si ripete a ogni tratto del grafo di visibilità: le cornici dei
// poligoni si calcolano una volta per l'array passato, non per ogni coppia.
const boundsCache = new WeakMap<Point[][], Map<Point[], Bounds>>();

function polygonBounds(polygon: Point[]): Bounds {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const point of polygon) {
    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.minY = Math.min(bounds.minY, point.y);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.maxY = Math.max(bounds.maxY, point.y);
  }
  return bounds;
}

function floorBounds(polygons: Point[][]) {
  let bounds = boundsCache.get(polygons);
  if (!bounds) {
    bounds = new Map(
      polygons.map((polygon) => [polygon, polygonBounds(polygon)]),
    );
    boundsCache.set(polygons, bounds);
  }
  return bounds;
}

const EPSILON = 1e-9;

const insideBounds = (p: Point, b: Bounds) =>
  p.x >= b.minX - EPSILON &&
  p.x <= b.maxX + EPSILON &&
  p.y >= b.minY - EPSILON &&
  p.y <= b.maxY + EPSILON;

/** Segment-AABB overlap, conservative: a polygon outside it cannot be cut. */
function touchesBounds(a: Point, b: Point, bounds: Bounds) {
  return !(
    Math.max(a.x, b.x) < bounds.minX - EPSILON ||
    Math.min(a.x, b.x) > bounds.maxX + EPSILON ||
    Math.max(a.y, b.y) < bounds.minY - EPSILON ||
    Math.min(a.y, b.y) > bounds.maxY + EPSILON
  );
}

function insideFloor(
  p: Point,
  polygons: Point[][],
  bounds = floorBounds(polygons),
): boolean {
  return polygons.some((polygon) => {
    const box = bounds.get(polygon)!;
    return (
      insideBounds(p, box) &&
      (pointInPolygon(p, polygon) ||
        polygon.some((q, i) =>
          onSegment(p, q, polygon[(i + 1) % polygon.length]),
        ))
    );
  });
}

export function segmentInsideFloor(
  a: Point,
  b: Point,
  polygons: Point[][],
): boolean {
  const bounds = floorBounds(polygons);
  const contains = (p: Point) => insideFloor(p, polygons, bounds);
  if (!contains(a) || !contains(b)) return false;
  const length = distance(a, b);
  if (length < 1e-7) return true;
  const cuts = [0, 1];
  for (const polygon of polygons) {
    if (!touchesBounds(a, b, bounds.get(polygon)!)) continue;
    for (let i = 0; i < polygon.length; i++) {
      const c = polygon[i],
        d = polygon[(i + 1) % polygon.length];
      const hit = lineIntersection(a, b, c, d);
      if (hit && onSegment(hit, a, b) && onSegment(hit, c, d))
        cuts.push(distance(a, hit) / length);
      // Collinear edges must also split coverage, including gaps between rooms.
      for (const p of [c, d])
        if (onSegment(p, a, b)) cuts.push(distance(a, p) / length);
    }
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((t, i) => {
    const middle = (t + cuts[i]) / 2;
    return contains({
      x: a.x + (b.x - a.x) * middle,
      y: a.y + (b.y - a.y) * middle,
    });
  });
}

/** Try orthogonal elbows first; use a visibility path around concave boundaries. */
export function indoorRoute(
  project: Project,
  floorId: string,
  start: Point,
  end: Point,
  polygons = floorRoutingPolygons(project, floorId),
): Point[] {
  // Partially drawn plans leave no walkable polygon: keep devices connectable.
  const direct = () => (samePoint(start, end) ? [start] : [start, end]);
  // Fuori piano il grafo di visibilità non può collegare nulla: stesso esito,
  // senza esplorare tutti i vertici (era il blocco su piante grandi).
  const bounds = floorBounds(polygons);
  if (
    !insideFloor(start, polygons, bounds) ||
    !insideFloor(end, polygons, bounds)
  )
    return direct();
  for (const corner of [
    { x: start.x, y: end.y },
    { x: end.x, y: start.y },
  ]) {
    if (
      segmentInsideFloor(start, corner, polygons) &&
      segmentInsideFloor(corner, end, polygons)
    )
      return [start, corner, end].filter(
        (p, i, all) => i === 0 || !samePoint(p, all[i - 1]),
      );
  }
  const nodes = [start, end, ...polygons.flat()];
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (current < 0 || costs[i] < costs[current]))
        current = i;
    if (current < 0 || !Number.isFinite(costs[current])) return direct();
    if (current === 1) {
      const path: Point[] = [];
      for (let i = 1; i >= 0; i = previous[i]) path.unshift(nodes[i]);
      return path;
    }
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      const cost = costs[current] + distance(nodes[current], nodes[i]);
      if (
        !visited.has(i) &&
        cost < costs[i] &&
        segmentInsideFloor(nodes[current], nodes[i], polygons)
      ) {
        costs[i] = cost;
        previous[i] = current;
      }
    }
  }
  return direct();
}
