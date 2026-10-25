import { Vector3 } from "three";
export function segmentDistance(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
) {
  const u = b.clone().sub(a),
    v = d.clone().sub(c),
    w = a.clone().sub(c);
  const uu = u.lengthSq(),
    vv = v.lengthSq(),
    uv = u.dot(v),
    uw = u.dot(w),
    vw = v.dot(w),
    det = uu * vv - uv * uv;
  const pointDistance = (
    p: Vector3,
    q: Vector3,
    direction: Vector3,
    length: number,
  ) =>
    p.distanceToSquared(
      q
        .clone()
        .addScaledVector(
          direction,
          length
            ? Math.max(0, Math.min(1, p.clone().sub(q).dot(direction) / length))
            : 0,
        ),
    );
  let best = Math.min(
    pointDistance(a, c, v, vv),
    pointDistance(b, c, v, vv),
    pointDistance(c, a, u, uu),
    pointDistance(d, a, u, uu),
  );
  if (det > 1e-12) {
    const s = (uv * vw - vv * uw) / det,
      t = (uu * vw - uv * uw) / det;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1)
      best = Math.min(
        best,
        a
          .clone()
          .addScaledVector(u, s)
          .distanceToSquared(c.clone().addScaledVector(v, t)),
      );
  }
  return best;
}
