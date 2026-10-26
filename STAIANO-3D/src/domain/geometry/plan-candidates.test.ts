import { describe, it, expect } from "vitest";
import {
  candidateRun,
  clipPlanSegment,
  consolidateWallCandidates,
  conflictingCandidates,
  nearestPlanSegment,
  subtractWallOpenings,
} from "./plan-candidates";
import type { WallCandidate } from "./plan-analysis";
const wall = (
  id: string,
  x: number,
  x2: number,
  y = 20,
  t = 8,
): WallCandidate => ({
  id,
  start: { x, y },
  end: { x: x2, y },
  layer: "Muri riconosciuti",
  kind: "raster-axis",
  confidence: 0.7,
  thicknessUnits: t,
  reason: "Test",
});
describe("assi e selezione delle proposte", () => {
  it("separa la muratura ai lati di una porta, conservando l'interpretazione originale da verificare", () => {
    const result = subtractWallOpenings(wall("long", 0, 200), [
      { start: { x: 80, y: 20 }, end: { x: 120, y: 20 } },
    ]);
    expect(
      result
        .filter((w) => w.layer === "Muri riconosciuti")
        .map((w) => [w.start.x, w.end.x]),
    ).toEqual([
      [0, 80],
      [120, 200],
    ]);
    expect(result[0].layer).toBe("Contorni da verificare");
    expect(
      subtractWallOpenings(wall("long", 0, 200), [
        { start: { x: 80, y: 80 }, end: { x: 120, y: 80 } },
      ]),
    ).toHaveLength(1);
  });
  it("unisce intervalli sovrapposti senza creare muratura nel varco", () => {
    const a = wall("a", 0, 100),
      b = wall("b", 60, 140),
      c = wall("c", 160, 240);
    const result = consolidateWallCandidates([a, b, c]);
    expect(result).toHaveLength(2);
    expect(result.find((w) => w.start.x === 0)?.end.x).toBe(140);
    expect(a.end.x).toBe(100);
  });
  it("conserva l'asse vettoriale e sposta la doppia interpretazione fra le alternative", () => {
    const exact = { ...wall("exact", 0, 100), kind: "paired-faces" };
    const alternative = wall("large", 0, 100, 25, 20);
    const result = consolidateWallCandidates([alternative, exact]);
    expect(result.find((w) => w.id === "exact")?.start.y).toBe(20);
    expect(result.find((w) => w.id === "large")?.layer).toBe(
      "Contorni da verificare",
    );
  });
  it("non confonde due pareti parallele con spazio libero fra loro", () => {
    expect(
      conflictingCandidates(wall("a", 0, 100), wall("b", 0, 100, 40)),
    ).toBe(false);
    expect(
      consolidateWallCandidates([
        wall("a", 0, 100),
        wall("b", 0, 100, 40),
      ]).every((w) => w.layer === "Muri riconosciuti"),
    ).toBe(true);
  });
  it("seleziona la fila adiacente senza saltare una porta", () => {
    const walls = [
      wall("a", 0, 40),
      wall("b", 40, 80),
      wall("c", 100, 160),
      wall("parallel", 0, 80, 40),
    ];
    expect(candidateRun(walls, "a", 1)).toEqual(["a", "b"]);
    expect(nearestPlanSegment(walls, { x: 60, y: 39 }, 10)?.id).toBe(
      "parallel",
    );
  });
  it("ritaglia anche una linea che attraversa tutta l'area e conserva lo spessore scalato", () => {
    const a = {
      ...wall("a", 0, 100),
      pdfStyle: {
        color: "#000000",
        width: 2,
        dash: [],
        path: 1,
        curved: false,
      },
    };
    expect(clipPlanSegment(a, 20, 10, 40, 30, 2)).toMatchObject({
      start: { x: 0, y: 20 },
      end: { x: 80, y: 20 },
      pdfStyle: { width: 4 },
    });
    expect(clipPlanSegment(a, 20, 30, 40, 20)).toBeNull();
  });
});
