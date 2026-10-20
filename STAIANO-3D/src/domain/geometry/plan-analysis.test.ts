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
  it("la maschera semantica esclude quote e arredi prima della vettorizzazione", () => {
    const width = 120,
      height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const paint = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = (y * width + x) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    };
    paint(10, 30, 110, 37);
    paint(60, 30, 67, 75);
    paint(10, 8, 100, 10);
    paint(10, 65, 50, 67);
    const mask = new Uint8Array(width * height);
    for (let y = 30; y <= 75; y++)
      for (let x = 10; x <= 110; x++)
        if ((y <= 37 && x <= 110) || (x >= 60 && x <= 67 && y >= 30))
          mask[y * width + x] = 1;
    const heuristic = analyzeRasterPixels(pixels, width, height);
    const semantic = analyzeRasterPixels(pixels, width, height, true, mask);
    expect(heuristic.walls.some((w) => w.start.y < 20 || w.end.y < 20)).toBe(
      true,
    );
    expect(semantic.walls.length).toBeGreaterThan(0);
    expect(
      semantic.walls.every((w) => Math.min(w.start.y, w.end.y) >= 25),
    ).toBe(true);
    expect(semantic.walls.some((w) => Math.min(w.start.y, w.end.y) < 20)).toBe(
      false,
    );
    expect(
      semantic.walls.some(
        (w) =>
          Math.abs(w.start.y - w.end.y) < 2 &&
          Math.min(w.start.y, w.end.y) > 60,
      ),
    ).toBe(false);
    expect(semantic.notes[0]).toContain("segmentazione semantica AI");
  });
  it("facce CAD parziali conservano gli assi esatti e il varco senza duplicare la faccia lunga", () => {
    const plan = {
      segments: [
        {
          id: "long",
          layer: "MURI",
          kind: "line",
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        {
          id: "left",
          layer: "MURI",
          kind: "line",
          start: { x: 4, y: 0.2 },
          end: { x: 0, y: 0.2 },
        },
        {
          id: "right",
          layer: "MURI",
          kind: "line",
          start: { x: 5, y: 0.2 },
          end: { x: 10, y: 0.2 },
        },
      ],
      suggestedMetersPerUnit: 1,
    } as ParsedPlan;
    const before = structuredClone(plan.segments);
    const walls = analyzeVectorPlan(plan).walls;
    expect(walls.filter((w) => w.kind === "paired-faces")).toHaveLength(2);
    expect(walls).toHaveLength(2);
    expect(walls.find((w) => w.end.x === 0)).toMatchObject({
      start: { x: 4, y: 0.1 },
      end: { x: 0, y: 0.1 },
      thicknessUnits: 0.2,
    });
    expect(walls.find((w) => w.start.x === 5)).toMatchObject({
      start: { x: 5, y: 0.1 },
      end: { x: 10, y: 0.1 },
      thicknessUnits: 0.2,
    });
    expect(plan.segments).toEqual(before);
  });
  it("layer quote e arredi non diventano muri automatici né proposte CAD", () => {
    for (const layer of [
      "QUOTE",
      "DIMENSIONS",
      "ARREDI",
      "FURNITURE",
      "TEXT",
      "RETINI",
    ]) {
      const segments = [
        {
          id: "a",
          layer,
          kind: "line",
          start: { x: 0, y: 0 },
          end: { x: 5, y: 0 },
        },
        {
          id: "b",
          layer,
          kind: "line",
          start: { x: 0, y: 0.2 },
          end: { x: 5, y: 0.2 },
        },
      ];
      expect(
        analyzeVectorPlan({ segments, suggestedMetersPerUnit: 1 } as ParsedPlan)
          .walls,
      ).toEqual([]);
    }
  });
  it("gli assi da facce parallele si incontrano agli angoli senza lasciare stanze aperte", () => {
    const segments = [
      {
        id: "h1",
        layer: "MURI",
        kind: "line",
        start: { x: 0, y: 0 },
        end: { x: 5, y: 0 },
      },
      {
        id: "h2",
        layer: "MURI",
        kind: "line",
        start: { x: 0.2, y: 0.2 },
        end: { x: 4.8, y: 0.2 },
      },
      {
        id: "v1",
        layer: "MURI",
        kind: "line",
        start: { x: 5, y: 0 },
        end: { x: 5, y: 4 },
      },
      {
        id: "v2",
        layer: "MURI",
        kind: "line",
        start: { x: 4.8, y: 0.2 },
        end: { x: 4.8, y: 3.8 },
      },
    ];
    const walls = analyzeVectorPlan({
      segments,
      suggestedMetersPerUnit: 1,
    } as ParsedPlan).walls.filter((w) => w.kind === "paired-faces");
    expect(walls).toHaveLength(2);
    expect(walls[0].end.x).toBeCloseTo(4.9);
    expect(walls[0].end.y).toBeCloseTo(0.1);
    expect(walls[1].start.x).toBeCloseTo(4.9);
    expect(walls[1].start.y).toBeCloseTo(0.1);
  });
});
