import { expect, it } from "vitest";
import { outdoorFanGrille } from "./OutdoorFan";

it("keeps every grille wire inside the fan rim, with finite coplanar endpoints", () => {
  const points = outdoorFanGrille.getAttribute("position");
  expect(points.count % 2).toBe(0);
  for (let i = 0; i < points.count; i++) {
    const radius = Math.hypot(points.getX(i), points.getY(i));
    expect(Number.isFinite(radius)).toBe(true);
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThanOrEqual(0.941);
    expect(points.getZ(i)).toBe(0);
  }
});
