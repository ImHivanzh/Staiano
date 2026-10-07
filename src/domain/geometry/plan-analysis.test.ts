import { describe, expect, it } from "vitest";
import type { ParsedPlan } from "@/services/import/plan-types";
import { analyzeRasterPixels, analyzeVectorPlan } from "./plan-analysis";

describe("riconoscimento locale della planimetria", () => {
  it("mantiene separati gli assi proposti e i tracciati originali", () => {
    const segments = [
      {
        id: "wall-1",
        layer: "WALL",
        kind: "line",
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      },
      {
        id: "wall-2",
        layer: "WALL",
        kind: "line",
        start: { x: 5, y: 0 },
        end: { x: 5, y: 4 },
      },
    ];
    const plan = { segments, suggestedMetersPerUnit: 1 } as ParsedPlan;
    const before = structuredClone(segments);
    const result = analyzeVectorPlan(plan);
    expect(result.walls).toHaveLength(2);
    const allIds = [...segments, ...result.walls].map((segment) => segment.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(
      result.walls.every(
        (wall) => wall.confidence < 0.9 && wall.thicknessUnits === null,
      ),
    ).toBe(true);
    expect(plan.segments).toEqual(before);
    expect(analyzeVectorPlan(plan)).toEqual(result);
  });

  it("propone l'asse e lo spessore delle facce parallele senza certificarli", () => {
    const plan = {
      segments: [
        {
          id: "a",
          layer: "MURI",
          kind: "line",
          start: { x: 0, y: 0 },
          end: { x: 5, y: 0 },
        },
        {
          id: "b",
          layer: "MURI",
          kind: "line",
          start: { x: 5, y: 0.2 },
          end: { x: 0, y: 0.2 },
        },
      ],
      suggestedMetersPerUnit: 1,
    } as ParsedPlan;
    const result = analyzeVectorPlan(plan);
    expect(result.walls).toHaveLength(1);
    expect(result.walls[0]).toMatchObject({
      id: "paired-a",
      start: { x: 0, y: 0.1 },
      end: { x: 5, y: 0.1 },
      thicknessUnits: 0.2,
    });
    expect(result.walls[0].confidence).toBeLessThan(0.9);
  });

  it("un raster senza tracce non produce muri o aperture inventati", () => {
    const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    const result = analyzeRasterPixels(pixels, 64, 64);
    expect(result.walls).toEqual([]);
    expect(result.openings).toEqual([]);
    expect(
      result.notes.some((note) => note.includes("Nessun muro affidabile")),
    ).toBe(true);
  });
});
