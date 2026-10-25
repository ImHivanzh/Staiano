import { expect, it } from "vitest";
import { flexibleDuctCurve } from "./flexible-curve";

const p = (x: number, y: number, elevationM = 2.5) => ({ x, y, elevationM });

it("uses straight runs and a tangent circular elbow of radius 2D without overshoot", () => {
  const result = flexibleDuctCurve([p(0, 0), p(2, 0), p(2, 2)], 160)!;
  expect(result.minimumRadiusM).toBeCloseTo(0.32);
  expect(result.curve.getLength()).toBeCloseTo(4 - 0.64 + (Math.PI * 0.32) / 2);
  expect(result.curve.getPoint(0).toArray()).toEqual([0, 2.5, 0]);
  expect(result.curve.getPoint(1).toArray()).toEqual([2, 2.5, 2]);
  for (const point of result.curve.getSpacedPoints(200)) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(2);
    expect(point.z).toBeGreaterThanOrEqual(0);
    expect(point.z).toBeLessThanOrEqual(2);
  }
  for (let i = 1; i < result.curve.curves.length; i++) {
    const previous = result.curve.curves[i - 1],
      next = result.curve.curves[i];
    expect(previous.getPoint(1).distanceTo(next.getPoint(0))).toBeLessThan(
      1e-8,
    );
    expect(previous.getTangent(1).dot(next.getTangent(0))).toBeGreaterThan(
      0.9999,
    );
  }
});

it("can use the available space down to R=D, but refuses tighter bends and reversals", () => {
  expect(
    flexibleDuctCurve([p(0, 0), p(0.2, 0), p(0.2, 1)], 160)!.minimumRadiusM,
  ).toBeCloseTo(0.2);
  expect(flexibleDuctCurve([p(0, 0), p(0.1, 0), p(0.1, 1)], 160)).toBeNull();
  expect(flexibleDuctCurve([p(0, 0), p(1, 0), p(0, 0)], 160)).toBeNull();
  expect(flexibleDuctCurve([p(0, 0), p(1, 0)], 0)).toBeNull();
});

it("uses ETF10's published minimum radius only for its published diameters", () => {
  const route = [p(0, 0), p(0.048, 0), p(0.048, 0.048)];
  expect(flexibleDuctCurve(route, 80)).toBeNull();
  expect(
    flexibleDuctCurve(route, 80, "ecoclima-etf10")?.minimumRadiusM,
  ).toBeCloseTo(0.048);
  expect(flexibleDuctCurve(route, 100, "ecoclima-etf10")).toBeNull();
  expect(
    flexibleDuctCurve([p(0, 0), p(0.096, 0), p(0.096, 0.096)], 80),
  ).not.toBeNull();
});

it("removes duplicate and collinear bend handles and supports vertical elbows", () => {
  const result = flexibleDuctCurve(
    [p(0, 0), p(0, 0), p(1, 0), p(2, 0), p(2, 0, 4.5)],
    160,
  )!;
  expect(result.curve.curves).toHaveLength(3);
  expect(result.minimumRadiusM).toBeCloseTo(0.32);
  expect(result.curve.getPoint(1).toArray()).toEqual([2, 4.5, 0]);
});

it("rejects a loop whose hose overlaps itself", () => {
  expect(
    flexibleDuctCurve([p(0, 0), p(2, 0), p(2, 2), p(0, 2), p(0, 0)], 160),
  ).toBeNull();
});

it.each([80, 160, 315])(
  "detects crossings between samples on long runs at diameter %s while allowing clearance",
  (diameterMm) => {
    for (const size of [100, 137, 250, 500, 1000]) {
      const route = [
        p(-size, -size),
        p(size, -size),
        p(size, size),
        p(-size, size),
        p(-size, -size / 2),
        p(size * 1.2, -size / 2),
      ];
      expect(
        flexibleDuctCurve(route, diameterMm) === null,
        `crossing at ${size}m`,
      ).toBe(true);
      expect(
        flexibleDuctCurve(
          route.map((point, index) =>
            index >= 4
              ? { ...point, elevationM: 2.5 + diameterMm / 1000 + 0.01 }
              : point,
          ),
          diameterMm,
        ),
      ).not.toBeNull();
    }
  },
);
