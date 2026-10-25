import { Curve, CurvePath, LineCurve3, Vector3 } from "three";
import { flexibleDuctMinimumRadiusFactor } from "@/domain/catalogs/flexible-ducts";
import type { RoutePoint } from "./routes";
import { segmentDistance } from "../geometry/segment-distance";

function selfSegment(
  a: Vector3,
  b: Vector3,
  error: number,
  start: number,
  end: number,
) {
  return {
    a,
    b,
    error,
    start,
    end,
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxY: Math.max(a.y, b.y),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

function selfSegmentsOverlap(
  a: ReturnType<typeof selfSegment>,
  b: ReturnType<typeof selfSegment>,
  diameter: number,
  tolerance: number,
): boolean {
  // Ignore neighbouring portions of one bend, not entire long runs near that bend.
  if (b.end - a.start <= 2 * diameter) return false;
  const limit = diameter + a.error + b.error - 1e-5;
  if (
    a.minX - b.maxX > limit ||
    b.minX - a.maxX > limit ||
    a.minY - b.maxY > limit ||
    b.minY - a.maxY > limit ||
    a.minZ - b.maxZ > limit ||
    b.minZ - a.maxZ > limit
  )
    return false;
  if (
    b.start - a.end >= 2 * diameter ||
    Math.max(a.end - a.start, b.end - b.start) <= tolerance
  )
    return segmentDistance(a.a, a.b, b.a, b.b) < limit ** 2;
  const splitA = a.end - a.start >= b.end - b.start;
  const segment = splitA ? a : b;
  const middle = segment.a.clone().add(segment.b).multiplyScalar(0.5);
  const along = (segment.start + segment.end) / 2;
  const first = selfSegment(
    segment.a,
    middle,
    segment.error,
    segment.start,
    along,
  );
  const second = selfSegment(
    middle,
    segment.b,
    segment.error,
    along,
    segment.end,
  );
  return splitA
    ? selfSegmentsOverlap(first, b, diameter, tolerance) ||
        selfSegmentsOverlap(second, b, diameter, tolerance)
    : selfSegmentsOverlap(a, first, diameter, tolerance) ||
        selfSegmentsOverlap(a, second, diameter, tolerance);
}

class CircularBend extends Curve<Vector3> {
  constructor(
    readonly center: Vector3,
    readonly radial: Vector3,
    readonly tangent: Vector3,
    readonly angle: number,
  ) {
    super();
  }

  getPoint(t: number, target = new Vector3()) {
    return target
      .copy(this.center)
      .addScaledVector(this.radial, Math.cos(t * this.angle))
      .addScaledVector(this.tangent, Math.sin(t * this.angle));
  }

  getPointAt(t: number, target = new Vector3()) {
    return this.getPoint(t, target);
  }
  getLength() {
    return this.radial.length() * this.angle;
  }
}

/** Circular fillets: prefer R=2D and respect the selected tube's published minimum. */
export function flexibleDuctCurve(
  points: RoutePoint[],
  diameterMm: number,
  productId?: string | null,
) {
  const minimumRadiusFactor = flexibleDuctMinimumRadiusFactor(
    productId,
    diameterMm,
  );
  if (
    !Number.isFinite(minimumRadiusFactor) ||
    minimumRadiusFactor <= 0 ||
    minimumRadiusFactor > 2
  )
    return null;
  return (
    attempt(points, diameterMm, 2, minimumRadiusFactor) ??
    attempt(points, diameterMm, minimumRadiusFactor, minimumRadiusFactor)
  );
}

/** `target` e `minimum` sono raggi espressi come multipli del diametro. */
function attempt(
  points: RoutePoint[],
  diameterMm: number,
  target: number,
  minimum: number,
) {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) return null;
  const vertices: Vector3[] = [];
  for (const point of points) {
    const vertex = new Vector3(point.x, point.elevationM, point.y);
    if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) return null;
    if (!vertices.length || vertex.distanceTo(vertices.at(-1)!) > 1e-6)
      vertices.push(vertex);
  }
  for (let i = vertices.length - 2; i > 0; i--) {
    const a = vertices[i]
      .clone()
      .sub(vertices[i - 1])
      .normalize();
    const b = vertices[i + 1].clone().sub(vertices[i]).normalize();
    if (a.dot(b) > 1 - 1e-8) vertices.splice(i, 1);
  }
  if (vertices.length < 2) return null;
  const directions = vertices
    .slice(1)
    .map((p, i) => p.clone().sub(vertices[i]).normalize());
  const angles = vertices.map((_, i) =>
    i && i < vertices.length - 1
      ? Math.acos(
          Math.max(-1, Math.min(1, directions[i - 1].dot(directions[i]))),
        )
      : 0,
  );
  if (angles.some((a) => a > Math.PI - 1e-4)) return null;
  const diameter = diameterMm / 1000;
  const trims = angles.map((a) => target * diameter * Math.tan(a / 2));
  const factors = directions.map((_, i) =>
    Math.min(
      1,
      vertices[i].distanceTo(vertices[i + 1]) / (trims[i] + trims[i + 1] || 1),
    ),
  );
  const radii = angles.map((angle, i) =>
    angle ? target * diameter * Math.min(factors[i - 1], factors[i]) : 0,
  );
  if (radii.some((r, i) => angles[i] > 1e-6 && r < diameter * minimum - 1e-8))
    return null;
  const curve = new CurvePath<Vector3>();
  let cursor = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const incoming = directions[i - 1],
      outgoing = directions[i];
    const trim = radii[i] * Math.tan(angles[i] / 2);
    const entry = vertices[i].clone().addScaledVector(incoming, -trim);
    const exit = vertices[i].clone().addScaledVector(outgoing, trim);
    if (cursor.distanceTo(entry) > 1e-7)
      curve.add(new LineCurve3(cursor, entry));
    const normal = outgoing
      .clone()
      .addScaledVector(incoming, -incoming.dot(outgoing))
      .normalize();
    const center = entry.clone().addScaledVector(normal, radii[i]);
    curve.add(
      new CircularBend(
        center,
        entry.clone().sub(center),
        incoming.clone().multiplyScalar(radii[i]),
        angles[i],
      ),
    );
    cursor = exit;
  }
  if (cursor.distanceTo(vertices.at(-1)!) > 1e-7)
    curve.add(new LineCurve3(cursor, vertices.at(-1)!));
  // Straight runs stay exact; arc chords have at most 1 mm sagitta, added conservatively to the clearance.
  const tolerance = Math.min(0.001, diameter / 100);
  let distance = 0;
  const segments = curve.curves.flatMap((part) => {
    const length = part.getLength();
    const error = part instanceof CircularBend ? tolerance : 0;
    const count =
      part instanceof CircularBend
        ? Math.max(
            1,
            Math.ceil(
              part.angle /
                (2 * Math.acos(1 - tolerance / part.radial.length())),
            ),
          )
        : 1;
    const result = Array.from({ length: count }, (_, index) => {
      const a = part.getPoint(index / count),
        b = part.getPoint((index + 1) / count);
      return selfSegment(
        a,
        b,
        error,
        distance + (length * index) / count,
        distance + (length * (index + 1)) / count,
      );
    });
    distance += length;
    return result;
  });
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 2; j < segments.length; j++)
      if (selfSegmentsOverlap(segments[i], segments[j], diameter, tolerance))
        return null;
  }
  return { curve, minimumRadiusM: Math.min(...radii.filter((r) => r > 0)) };
}
