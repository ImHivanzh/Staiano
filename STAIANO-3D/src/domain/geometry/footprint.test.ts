import { describe, expect, it } from "vitest";
import { nearestFootprintEdge } from "./footprint";

describe("origine collegamento sul bordo macchina", () => {
  const machine = {
    position: { x: 3, y: 4 },
    widthMm: 1000,
    depthMm: 600,
    rotation: 0,
  };
  it.each([
    [
      { x: 6, y: 4 },
      { x: 3.5, y: 4 },
    ],
    [
      { x: 0, y: 4 },
      { x: 2.5, y: 4 },
    ],
    [
      { x: 3, y: 6 },
      { x: 3, y: 4.3 },
    ],
    [
      { x: 3, y: 1 },
      { x: 3, y: 3.7 },
    ],
    [
      { x: 6, y: 6 },
      { x: 3.5, y: 4.3 },
    ],
    [
      { x: 3, y: 4 },
      { x: 3, y: 3.7 },
    ],
  ])("sceglie il punto di bordo più vicino a %j", (target, expected) => {
    const point = nearestFootprintEdge(machine, target);
    expect(point.x).toBeCloseTo(expected.x);
    expect(point.y).toBeCloseTo(expected.y);
  });
  it("rispetta la rotazione della macchina", () => {
    const point = nearestFootprintEdge(
      { ...machine, rotation: Math.PI / 2 },
      { x: 6, y: 4 },
    );
    expect(point.x).toBeCloseTo(3.3);
    expect(point.y).toBeCloseTo(4);
  });
});
