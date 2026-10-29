import { expect, it } from "vitest";
import * as THREE from "three";
import { trapezoidalPlenumPieces } from "./trapezoidal-plenum-shell";

function bounds(pieces: ReturnType<typeof trapezoidalPlenumPieces>) {
  const box = new THREE.Box3();
  for (const { geometry } of pieces) {
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
  }
  return box.getSize(new THREE.Vector3());
}

it("builds the ceiling plenum as L x 240 high x 149 deep from the Ecoclima drawing", () => {
  const pieces = trapezoidalPlenumPieces(2, "ceiling", [], []);
  const size = bounds(pieces);
  expect(size.x).toBeCloseTo(2, 6);
  expect(size.y).toBeCloseTo(0.24, 6);
  expect(size.z).toBeCloseTo(0.149, 6);
  // cinque lamiere del profilo e due testate
  expect(pieces.filter((p) => p.kind === "sheet")).toHaveLength(5);
  expect(pieces.filter((p) => p.kind === "cap")).toHaveLength(2);
});

it("turns the same body on the wall: the 240 mm goes behind the grille", () => {
  const size = bounds(trapezoidalPlenumPieces(1.2, "wall", [], []));
  expect(size.x).toBeCloseTo(1.2, 6);
  expect(size.y).toBeCloseTo(0.149, 6);
  expect(size.z).toBeCloseTo(0.24, 6);
});

it("cuts the Ø145 collar holes in the wide face", () => {
  const closed = trapezoidalPlenumPieces(2, "ceiling", [], []);
  const open = trapezoidalPlenumPieces(
    2,
    "ceiling",
    [
      { x: -0.5, radius: 0.0725 },
      { x: 0.5, radius: 0.0725 },
    ],
    [],
  );
  const count = (pieces: typeof closed) =>
    pieces[3].geometry.getAttribute("position").count;
  expect(count(open)).toBeGreaterThan(count(closed));
});

it("applies the drawing only to the P 240 series with 65 or 75 necks", async () => {
  const { usesTrapezoidalDrawing } = await import(
    "@/domain/air-terminals/trapezoidal-plenum"
  );
  expect(usesTrapezoidalDrawing("EDLS", { widthMm: 75, heightMm: 240 })).toBe(true);
  expect(usesTrapezoidalDrawing("EDLH", { widthMm: 65, heightMm: 240 })).toBe(true);
  expect(usesTrapezoidalDrawing("EDLS", { widthMm: 105, heightMm: 300 })).toBe(false);
  expect(usesTrapezoidalDrawing("EDFL", { widthMm: 75, heightMm: 240 })).toBe(false);
});

it("opens the mouth exactly as wide as the grille, flush with the flat wall", () => {
  const cap = trapezoidalPlenumPieces(2, "ceiling", [], [], 80)[5].geometry;
  const pos = cap.getAttribute("position");
  const mouth: number[] = [];
  for (let i = 0; i < pos.count; i++)
    if (Math.abs(pos.getY(i) + 0.12) < 1e-6) mouth.push(pos.getZ(i));
  expect(Math.max(...mouth) - Math.min(...mouth)).toBeCloseTo(0.08, 6);
  expect(Math.min(...mouth)).toBeCloseTo(-0.0745, 6);
});
