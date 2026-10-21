import { Curve, CurvePath, LineCurve3, Vector3 } from "three";
import type { RoutePoint } from "./routes";

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

/** Circular fillets: prefer R=2D (Lindab); never below R=D (ADC installation guidance).
 * https://flexibleduct.org/images/ADC~IR5E.pdf, section 4.4. Product-specific limits still apply.
 */
export function flexibleDuctCurve(points: RoutePoint[], diameterMm: number) {
  return attempt(points, diameterMm, 2) ?? attempt(points, diameterMm, 1);
}

/** `target` è il raggio in diametri: 2 ideale, 1 minimo ammesso all'attacco. */
function attempt(points: RoutePoint[], diameterMm: number, target: 1 | 2) {
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
  if (radii.some((r, i) => angles[i] > 1e-6 && r < diameter - 1e-8))
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
  const length = curve.getLength();
  const count = Math.min(1024, Math.max(8, Math.ceil(length / (diameter / 2))));
  const samples = curve.getSpacedPoints(count);
  const adjacent = Math.ceil((2 * diameter) / (length / count));
  for (let i = 0; i < samples.length; i++)
    for (let j = i + adjacent + 1; j < samples.length; j++)
      if (samples[i].distanceToSquared(samples[j]) < (diameter - 1e-5) ** 2)
        return null;
  return { curve, minimumRadiusM: Math.min(...radii.filter((r) => r > 0)) };
}
