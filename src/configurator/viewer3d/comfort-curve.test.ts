import { expect, it } from "vitest";
import { comfortFlowCurve } from "./comfort-curve";
import type { ComfortField } from "./comfort-fields";

it("undulates along the flow while preserving endpoints and vertical direction", () => {
  for (const kind of ["supply", "return", "convection"] as const) {
    const field: ComfortField = {
      deviceId: "outlet",
      kind,
      start: [0, 2, 0],
      control: [0, 1.8, 1],
      end: [0, 1.5, 2],
    };
    const curve = comfortFlowCurve(field);
    expect(curve.getPoint(0).toArray()).toEqual(field.start);
    curve
      .getPoint(1)
      .toArray()
      .forEach((value, i) => expect(value).toBeCloseTo(field.end[i], 12));
    const points = curve.getPoints(96);
    expect(points.some((p) => p.x > 0.03)).toBe(true);
    expect(points.some((p) => p.x < -0.03)).toBe(true);
    expect(points.every((p, i) => i === 0 || p.y <= points[i - 1].y)).toBe(
      true,
    );
    expect(points.every((p) => Math.abs(p.x) <= 0.08)).toBe(true);
  }
});

it("keeps vertical convection finite and wavy", () => {
  const curve = comfortFlowCurve({
    deviceId: "radiator",
    kind: "convection",
    start: [0, 1, 0],
    control: [0, 1.5, 0],
    end: [0, 2, 0],
  });
  expect(
    curve.getPoints(48).every((p) => p.toArray().every(Number.isFinite)),
  ).toBe(true);
  expect(curve.getPoints(48).some((p) => Math.abs(p.x) > 0.02)).toBe(true);
});
