import { describe, expect, it } from "vitest";
import { reconstructPlan2D } from "./automatic-plan";
import { preparePlanImport, applyPlanImport } from "./import-plan";
import { createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import type { PlanAnalysis } from "./plan-analysis";
import type { Reconstruction } from "@/services/import/reconstruction-schema";
import type { ParsedPlan } from "@/services/import/plan-types";

function fixture(gap = false) {
  const polygon = [
    { x: 20, y: 20 },
    { x: 220, y: 20 },
    { x: 220, y: 180 },
    { x: 20, y: 180 },
  ];
  const physical: PlanAnalysis = {
    notes: [],
    openings: [],
    walls: polygon.map((start, i) => ({
      id: `wall-${i}`,
      layer: "Muri riconosciuti",
      kind: "raster-axis",
      start,
      end: polygon[(i + 1) % 4],
      thicknessUnits: 6,
      confidence: 0.7,
      reason: "Muro originale",
    })),
  };
  if (gap)
    physical.walls.splice(
      0,
      1,
      { ...physical.walls[0], end: { x: 100, y: 20 } },
      { ...physical.walls[0], id: "gap", start: { x: 130, y: 20 } },
    );
  const model: Reconstruction = {
    width: 256,
    height: 256,
    device: "cuda",
    shapes: [
      { label: 8, points: polygon.map((p) => ({ x: p.x + 4, y: p.y + 3 })) },
    ],
  };
  return { model, physical };
}
describe("ricostruzione automatica della planimetria 2D", () => {
  it("preferisce l’asse di un muro misurato a un contorno debole più vicino al bordo predetto", () => {
    const { model, physical } = fixture();
    physical.walls.push({
      ...physical.walls[0],
      id: "faint-outline",
      start: { x: 20, y: 23 },
      end: { x: 220, y: 23 },
      thicknessUnits: 3,
      confidence: 0.65,
      kind: "raster-oblique-axis",
    });
    const result = reconstructPlan2D(model, physical);
    expect(result.roomsDetected).toBe(1);
    expect(
      Math.min(...result.walls.flatMap((wall) => [wall.start.y, wall.end.y])),
    ).toBe(20);
  });
  it("non prolunga un muro nel portico quando la traccia originale termina prima", () => {
    const { model, physical } = fixture();
    model.shapes = [
      {
        label: 8,
        points: [
          { x: 100, y: 20 },
          { x: 220, y: 20 },
          { x: 220, y: 180 },
          { x: 100, y: 180 },
        ],
      },
      {
        label: 8,
        points: [
          { x: 20, y: 20 },
          { x: 100, y: 20 },
          { x: 100, y: 240 },
          { x: 20, y: 240 },
        ],
      },
    ];
    physical.walls = [
      [20, 20, 220, 20],
      [20, 20, 20, 240],
      [100, 20, 100, 180],
      [220, 20, 220, 180],
      [100, 180, 220, 180],
    ].map(([x, y, x2, y2], i) => ({
      ...physical.walls[0],
      id: `ink-${i}`,
      start: { x, y },
      end: { x: x2, y: y2 },
    }));
    physical.walls.push({
      ...physical.walls[0],
      id: "letter-in-portico",
      start: { x: 100, y: 220 },
      end: { x: 100, y: 240 },
      thicknessUnits: 3,
      confidence: 0.65,
    });
    const result = reconstructPlan2D(model, physical);
    expect(result.roomsDetected).toBe(1);
    expect(
      result.walls.some(
        (wall) =>
          wall.start.x === 100 &&
          wall.end.x === 100 &&
          Math.max(wall.start.y, wall.end.y) > 181,
      ),
    ).toBe(false);
  });
  it("chiude entrambe le stanze quando una giunzione condivisa differisce di pochi pixel", () => {
    const { model, physical } = fixture();
    model.width = 512;
    model.shapes = [
      {
        label: 8,
        points: [
          { x: 20, y: 20 },
          { x: 200, y: 20 },
          { x: 200, y: 200 },
          { x: 20, y: 200 },
        ],
      },
      {
        label: 8,
        points: [
          { x: 200, y: 20 },
          { x: 400, y: 20 },
          { x: 400, y: 200 },
          { x: 200, y: 200 },
        ],
      },
    ];
    physical.walls = [
      [20, 20, 400, 20],
      [20, 20, 20, 200],
      [20, 200, 200, 200],
      [200, 20, 200, 200],
      [400, 20, 400, 200],
      [200, 202, 400, 200],
    ].map(([x, y, x2, y2], i) => ({
      ...physical.walls[0],
      id: `actual-${i}`,
      start: { x, y },
      end: { x: x2, y: y2 },
    }));
    expect(reconstructPlan2D(model, physical).roomsDetected).toBe(2);
  });
  it("allinea le stanze ai muri effettivi e scarta una divisione inventata", () => {
    const { model, physical } = fixture();
    model.shapes = [
      {
        label: 8,
        points: [
          { x: 24, y: 23 },
          { x: 124, y: 23 },
          { x: 124, y: 183 },
          { x: 24, y: 183 },
        ],
      },
      {
        label: 8,
        points: [
          { x: 124, y: 23 },
          { x: 224, y: 23 },
          { x: 224, y: 183 },
          { x: 124, y: 183 },
        ],
      },
    ];
    const result = reconstructPlan2D(model, physical);
    expect(result.reconstructed).toBe(true);
    expect(result.roomsDetected).toBe(1);
    expect(
      result.walls.some((wall) => wall.start.x === 124 && wall.end.x === 124),
    ).toBe(false);
    expect(Math.min(...result.walls.map((w) => w.start.y))).toBe(20);
  });
  it("mantiene il varco come apertura da verificare senza riempirlo con muratura", () => {
    const { model, physical } = fixture(true);
    const result = reconstructPlan2D(model, physical);
    expect(result.reconstructed).toBe(true);
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0].confidence).toBe(0.5);
    expect(result.openings[0].reason).toContain("Varco visibile");
    expect(
      Math.abs(result.openings[0].start.x - result.openings[0].end.x),
    ).toBe(30);
  });
  it("non trasforma una parte di pianta assente in una porta enorme", () => {
    const { model, physical } = fixture(true);
    physical.walls[0].end.x = 60;
    physical.walls[1].start.x = 180;
    expect(reconstructPlan2D(model, physical).reconstructed).not.toBe(true);
  });
  it("ricostruisce una stanza e importa il varco come porta modificabile", () => {
    const { model, physical } = fixture(true);
    model.shapes.push({
      label: 10,
      points: [
        { x: 100, y: 20 },
        { x: 130, y: 20 },
      ],
    });
    const result = reconstructPlan2D(model, physical);
    expect(result.reconstructed).toBe(true);
    expect(result.roomsDetected).toBe(1);
    const parsed = {
      sourceType: "raster",
      filename: "pianta.png",
      mimeType: "image/png",
      sizeBytes: 100,
      background: null,
      segments: result.walls,
      analysis: result,
      annotations: [],
      layers: [],
      warnings: [],
      suggestedMetersPerUnit: null,
      unitLabel: "pixel",
    } satisfies ParsedPlan;
    const imported = preparePlanImport(parsed, {
      selectedLayers: ["Muri riconosciuti"],
      excludedIds: [],
      metersPerUnit: 0.02,
      thicknessM: 0.1,
      convertGeometry: true,
      origin: { x: 0, y: 0 },
    });
    const empty = createProject(),
      project = applyPlanImport(empty, empty.floors[0].id, imported);
    expect(project.rooms).toHaveLength(1);
    expect(project.openings).toHaveLength(1);
    expect(project.openings[0].type).toBe("door");
    expect(project.openings[0].widthM).toBeCloseTo(0.6, 8);
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
});
