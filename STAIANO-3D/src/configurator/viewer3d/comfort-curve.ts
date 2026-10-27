import { CatmullRomCurve3, QuadraticBezierCurve3, Vector3 } from "three";
import type { ComfortField } from "./comfort-fields";

/** A gentle S-sweep tapers at both ends so outlets and return inlets stay anchored. */
export function comfortFlowCurve(field: ComfortField) {
  const base = new QuadraticBezierCurve3(
    new Vector3(...field.start),
    new Vector3(...field.control),
    new Vector3(...field.end),
  );
  const direction = new Vector3().subVectors(base.v2, base.v0);
  const sideways = new Vector3(direction.z, 0, -direction.x);
  if (sideways.lengthSq() < 1e-8) sideways.set(1, 0, 0);
  sideways.normalize();
  const amplitude = Math.min(0.075, direction.length() * 0.06);
  return new CatmullRomCurve3(
    Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      return base
        .getPoint(t)
        .addScaledVector(
          sideways,
          amplitude * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * t),
        );
    }),
  );
}
