import type { Point, Wall } from "@/schemas/project";

export const EPS = 1e-7;
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const samePoint = (a: Point, b: Point, tolerance = 1e-5) =>
  distance(a, b) < tolerance;
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const subtract = (a: Point, b: Point) => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Point, s: number) => ({ x: a.x * s, y: a.y * s });
export function signedArea(p: Point[]) {
  return p.reduce((sum, a, i) => sum + cross(a, p[(i + 1) % p.length]), 0) / 2;
}
export const area = (p: Point[]) => Math.abs(signedArea(p));
export const perimeter = (p: Point[]) =>
  p.reduce((sum, a, i) => sum + distance(a, p[(i + 1) % p.length]), 0);
export function centroid(p: Point[]): Point {
  const a = signedArea(p);
  if (Math.abs(a) < EPS) return p[0] ?? { x: 0, y: 0 };
  let x = 0,
    y = 0;
  p.forEach((v, i) => {
    const w = p[(i + 1) % p.length];
    const c = cross(v, w);
    x += (v.x + w.x) * c;
    y += (v.y + w.y) * c;
  });
  return { x: x / (6 * a), y: y / (6 * a) };
}
export function bounds(points: Point[]) {
  if (!points.length) return { minX: -1, minY: -1, maxX: 11, maxY: 9 };
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function lineIntersection(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const r = subtract(b, a),
    s = subtract(d, c),
    denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return null;
  return add(a, scale(r, cross(subtract(c, a), s) / denominator));
}
export function projection(p: Point, a: Point, b: Point): Point {
  const v = subtract(b, a),
    length2 = v.x * v.x + v.y * v.y;
  const t =
    length2 < EPS
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / length2),
        );
  return add(a, scale(v, t));
}
export const onSegment = (p: Point, a: Point, b: Point) =>
  distance(projection(p, a, b), p) < 1e-5;
export function selfIntersects(p: Point[]): boolean {
  for (let i = 0; i < p.length; i++)
    for (let j = i + 2; j < p.length; j++) {
      if (i === 0 && j === p.length - 1) continue;
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[j],
        d = p[(j + 1) % p.length];
      const hit = lineIntersection(a, b, c, d);
      if (hit && onSegment(hit, a, b) && onSegment(hit, c, d)) return true;
      if (!hit && (onSegment(c, a, b) || onSegment(d, a, b))) return true;
    }
  return false;
}
export type SnapOptions = {
  enabled: boolean;
  orthogonal: boolean;
  angle45: boolean;
  grid: boolean;
  parallel: boolean;
  stepM: number;
  toleranceM: number;
};
export function snapPoint(
  p: Point,
  walls: Wall[],
  anchor: Point | null,
  options: SnapOptions,
): { point: Point; kind: string } {
  if (!options.enabled) return { point: p, kind: "libero" };
  const endpoints = walls.flatMap((w) => [w.start, w.end]);
  if (anchor) endpoints.push(anchor);
  const closest = endpoints.toSorted(
    (a, b) => distance(a, p) - distance(b, p),
  )[0];
  if (closest && distance(closest, p) <= options.toleranceM)
    return { point: { ...closest }, kind: "estremo" };
  const segments = walls
    .map((w) => projection(p, w.start, w.end))
    .toSorted((a, b) => distance(a, p) - distance(b, p));
  if (segments[0] && distance(segments[0], p) <= options.toleranceM)
    return { point: segments[0], kind: "segmento" };
  if (anchor && (options.orthogonal || options.angle45 || options.parallel)) {
    const r = distance(anchor, p),
      angle = Math.atan2(p.y - anchor.y, p.x - anchor.x);
    const angles = options.angle45
      ? Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
      : options.orthogonal
        ? [0, Math.PI / 2, Math.PI, -Math.PI / 2]
        : [];
    if (options.parallel)
      walls.forEach((w) => {
        const a = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
        angles.push(a, a + Math.PI);
      });
    const choices = angles
      .map((a) => ({
        x: anchor.x + r * Math.cos(a),
        y: anchor.y + r * Math.sin(a),
      }))
      .toSorted((a, b) => distance(a, p) - distance(b, p));
    if (choices[0] && distance(choices[0], p) <= options.toleranceM * 2)
      return {
        point: choices[0],
        kind: Math.abs(Math.sin(angle * 2)) < 0.15 ? "ortogonale" : "angolo",
      };
  }
  return options.grid
    ? {
        point: {
          x: Math.round(p.x / options.stepM) * options.stepM,
          y: Math.round(p.y / options.stepM) * options.stepM,
        },
        kind: "griglia",
      }
    : { point: p, kind: "libero" };
}
export function calibratedScale(a: Point, b: Point, realDistanceM: number) {
  const pixels = distance(a, b);
  if (!Number.isFinite(realDistanceM) || realDistanceM <= 0 || pixels < 1)
    throw new Error(
      "Selezionare due punti distinti e una distanza reale positiva.",
    );
  return realDistanceM / pixels;
}
