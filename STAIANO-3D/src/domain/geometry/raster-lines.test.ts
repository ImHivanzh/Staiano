import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import corpus from "../../../tests/fixtures/plan-recognition/manifest.json";
import { recognizeRaster } from "./raster-lines";
import { distance, projection } from "./primitives";
import type { WallCandidate } from "./plan-analysis";

describe("fusione delle evidenze AI e dei tratti originali", () => {
  it("non riempie il vano porta fra due tratti collineari", () => {
    const width = 512,
      height = 512;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const mask = new Uint8Array(width * height);
    for (let y = 100; y < 109; y++)
      for (let x = 50; x < 350; x++)
        if (x < 180 || x >= 195) {
          const i = y * width + x;
          mask[i] = 1;
          pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 0;
        }
    const walls = recognizeRaster(pixels, width, height, true, mask).walls;
    expect(walls).toHaveLength(2);
    expect(
      walls.some(
        (wall) =>
          Math.min(wall.start.x, wall.end.x) < 180 &&
          Math.max(wall.start.x, wall.end.x) >= 195,
      ),
    ).toBe(false);
  });
  it.each([7, 8])(
    "recupera un muro corto di %i pixel vicino all’evidenza AI",
    (thickness) => {
      const width = 256,
        height = 256;
      const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
      const mask = new Uint8Array(width * height);
      for (let y = 60; y < 60 + thickness; y++)
        for (let x = 50; x < 95; x++) {
          const i = y * width + x;
          pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 0;
        }
      for (let y = 53; y < 56; y++)
        for (let x = 50; x < 95; x++) mask[y * width + x] = 1;
      const walls = recognizeRaster(pixels, width, height, true, mask).walls;
      expect(
        walls.some(
          (wall) =>
            wall.thicknessUnits === thickness &&
            Math.abs(wall.start.y - (60 + (thickness - 1) / 2)) < 1,
        ),
      ).toBe(true);
    },
  );
  it("esclude una linea spessa estranea che tocca la maschera soltanto a un estremo", () => {
    const width = 256,
      height = 256;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const mask = new Uint8Array(width * height);
    for (let y = 120; y < 127; y++)
      for (let x = 40; x < 220; x++) {
        const i = (y * width + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    for (let y = 40; y < 140; y++)
      for (let x = 35; x < 40; x++) mask[y * width + x] = 1;
    expect(
      recognizeRaster(pixels, width, height, true, mask).walls.some(
        (wall) => Math.abs(wall.end.x - wall.start.x) > 150,
      ),
    ).toBe(false);
  });
});

function coverage(probe: number[], walls: WallCandidate[], tolerance: number) {
  const [x, y, x2, y2] = probe,
    length = Math.hypot(x2 - x, y2 - y);
  let matches = 0;
  for (let i = 0; i <= 30; i++) {
    const p = { x: x + ((x2 - x) * i) / 30, y: y + ((y2 - y) * i) / 30 };
    if (
      walls.some((w) => {
        const dot = Math.abs(
          ((w.end.x - w.start.x) * (x2 - x) +
            (w.end.y - w.start.y) * (y2 - y)) /
            (distance(w.start, w.end) * length),
        );
        return (
          dot > 0.99 && distance(p, projection(p, w.start, w.end)) <= tolerance
        );
      })
    )
      matches++;
  }
  return matches / 31;
}

describe("riferimenti reali: scansioni, colore, arredi, quote e riempimenti", () => {
  for (const sample of corpus)
    it(sample.id, () => {
      const raw = gunzipSync(
        readFileSync(
          new URL(
            `../../../tests/fixtures/plan-recognition/${sample.file}`,
            import.meta.url,
          ),
        ),
      );
      expect(createHash("sha256").update(raw).digest("hex")).toBe(
        sample.sha256,
      );
      const result = recognizeRaster(
        new Uint8ClampedArray(raw),
        sample.width,
        sample.height,
      );
      const scores = sample.wallProbes.map((p) =>
        coverage(p, result.walls, sample.tolerancePx),
      );
      expect(new Set(result.walls.map((w) => w.id)).size).toBe(
        result.walls.length,
      );
      for (let i = 0; i < result.walls.length; i++)
        for (let j = i + 1; j < result.walls.length; j++) {
          const a = result.walls[i],
            b = result.walls[j];
          expect(
            distance(a.start, b.start) < 1e-6 &&
              distance(a.end, b.end) < 1e-6 &&
              a.thicknessUnits === b.thicknessUnits,
          ).toBe(false);
        }
      // These are manually identified wall probes, not exhaustive semantic labels.
      // Report coverage of these references; do not call it global precision.
      expect(
        scores.reduce((sum, v) => sum + v, 0) / scores.length,
        JSON.stringify(scores),
      ).toBeGreaterThanOrEqual(sample.minimumCoverage);
      expect(
        result.walls.every((w) =>
          [w.start.x, w.start.y, w.end.x, w.end.y].every(Number.isFinite),
        ),
      ).toBe(true);
      for (const w of result.walls.filter((w) => w.confidence >= 0.9)) {
        expect(w.thicknessUnits).toBeGreaterThanOrEqual(5);
        expect(w.layer).toBe("Muri riconosciuti");
        if (sample.id === "lemon")
          expect(
            coverage(
              [w.start.x, w.start.y, w.end.x, w.end.y],
              [{ ...w, start: { x: 283, y: 0 }, end: { x: 283, y: 183 } }],
              9,
            ),
          ).toBeGreaterThan(0.9);
        else
          expect.fail(
            "Il corpus senza tratti pieni certi non deve importare automaticamente quote o mobili.",
          );
      }
    });
});

function draw(lines: number[][], width = 400, height = 300) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [x, y, x2, y2, thickness, gray] of lines) {
    const steps = Math.ceil(Math.hypot(x2 - x, y2 - y) * 2);
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x + ((x2 - x) * i) / steps),
        cy = Math.round(y + ((y2 - y) * i) / steps);
      for (
        let dy = -Math.floor(thickness / 2);
        dy <= Math.floor(thickness / 2);
        dy++
      )
        for (
          let dx = -Math.floor(thickness / 2);
          dx <= Math.floor(thickness / 2);
          dx++
        ) {
          if (
            cx + dx < 0 ||
            cx + dx >= width ||
            cy + dy < 0 ||
            cy + dy >= height
          )
            continue;
          const offset = ((cy + dy) * width + cx + dx) * 4;
          pixels.set([gray, gray, gray, 255], offset);
        }
    }
  }
  return pixels;
}

describe("geometria e limiti del riconoscimento", () => {
  for (const degrees of [3, 23, 45, 90])
    it(`scansione ruotata ${degrees}°: tratti chiari e rumore mantengono i muri`, () => {
      const angle = (degrees * Math.PI) / 180;
      const rotate = (x: number, y: number) => [
        200 + (x - 200) * Math.cos(angle) - (y - 150) * Math.sin(angle),
        150 + (x - 200) * Math.sin(angle) + (y - 150) * Math.cos(angle),
      ];
      const corners = [
        [95, 70],
        [305, 70],
        [305, 230],
        [95, 230],
      ].map(([x, y]) => rotate(x, y));
      const refs = corners.map((p, i) => [...p, ...corners[(i + 1) % 4]]);
      const pixels = draw(refs.map((p) => [...p, 1, 210]));
      let seed = 2026;
      for (let i = 0; i < 600; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const offset = (seed % (400 * 300)) * 4;
        pixels.set([190, 190, 190, 255], offset);
      }
      const result = recognizeRaster(pixels, 400, 300);
      for (const probe of refs)
        expect(coverage(probe, result.walls, 4)).toBeGreaterThan(0.8);
      expect(result.walls.every((w) => w.confidence < 0.9)).toBe(true);
    });
  it("non perde i contorni da un pixel chiari e non inventa lo spessore", () => {
    const refs = [
      [40, 40, 360, 40],
      [360, 40, 360, 260],
      [360, 260, 40, 260],
      [40, 260, 40, 40],
    ];
    const r = recognizeRaster(draw(refs.map((p) => [...p, 1, 205])), 400, 300);
    expect(r.walls).toHaveLength(4);
    for (const p of refs) expect(coverage(p, r.walls, 1)).toBe(1);
    expect(
      r.walls.every((w) => w.thicknessUnits === null && w.confidence < 0.9),
    ).toBe(true);
  });
  it("i muri pieni collegati hanno assi precisi e vengono preselezionati", () => {
    const refs = [
      [40, 40, 360, 40],
      [360, 40, 360, 260],
      [360, 260, 40, 260],
      [40, 260, 40, 40],
    ];
    const r = recognizeRaster(draw(refs.map((p) => [...p, 7, 0])), 400, 300);
    for (const p of refs)
      expect(
        coverage(
          p,
          r.walls.filter((w) => w.confidence >= 0.9),
          1,
        ),
      ).toBe(1);
  });
  it("unisce due facce in un solo asse senza chiudere le aperture", () => {
    const r = recognizeRaster(
      draw([
        [40, 40, 340, 40, 1, 80],
        [55, 50, 330, 50, 1, 80],
        [40, 150, 180, 150, 7, 0],
        [220, 150, 340, 150, 7, 0],
      ]),
      400,
      300,
    );
    const pair = r.walls.find((w) => w.kind === "raster-paired-faces");
    expect(pair?.thicknessUnits).toBeCloseTo(10);
    expect(pair?.start.y).toBeCloseTo(45);
    expect(
      r.walls.some(
        (w) =>
          w.start.x < 190 && w.end.x > 210 && Math.abs(w.start.y - 150) < 5,
      ),
    ).toBe(false);
    expect(r.openings).toEqual([]);
  });
  it("distingue il tratto di stampa dallo spessore di un muro a doppia faccia ruotato", () => {
    const angle = (3 * Math.PI) / 180;
    const rotate = (x: number, y: number) => [
      200 + (x - 200) * Math.cos(angle) - (y - 150) * Math.sin(angle),
      150 + (x - 200) * Math.sin(angle) + (y - 150) * Math.cos(angle),
    ];
    const rectangle = (
      left: number,
      top: number,
      right: number,
      bottom: number,
    ) => {
      const corners = [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ].map(([x, y]) => rotate(x, y));
      return corners.map((p, i) => [...p, ...corners[(i + 1) % 4]]);
    };
    const faces = [
      ...rectangle(80, 60, 320, 240),
      ...rectangle(100, 80, 300, 220),
    ];
    const result = recognizeRaster(
      draw(faces.map((p) => [...p, 5, 80])),
      400,
      300,
    );
    const paired = result.walls.filter((w) => w.kind === "raster-paired-faces");
    for (const probe of rectangle(90, 70, 310, 230))
      expect(coverage(probe, paired, 3)).toBeGreaterThan(0.9);
    expect(paired.every((w) => Math.abs(w.thicknessUnits! - 20) < 2)).toBe(
      true,
    );
  });
  it("segue un contorno obliquo senza trasformarlo in una scala ortogonale", () => {
    const refs = [
      [80, 70, 300, 180],
      [300, 180, 260, 260],
      [260, 260, 40, 150],
      [40, 150, 80, 70],
    ];
    const r = recognizeRaster(draw(refs.map((p) => [...p, 1, 80])), 400, 300);
    for (const p of refs) expect(coverage(p, r.walls, 4)).toBeGreaterThan(0.8);
    expect(r.walls.every((w) => w.confidence < 0.9)).toBe(true);
  });
  it("le facce interrotte restano due assi separati, con coordinate centrali esatte", () => {
    const result = recognizeRaster(
      draw([
        [40, 40, 340, 40, 1, 80],
        [80, 50, 150, 50, 1, 80],
        [200, 50, 320, 50, 1, 80],
      ]),
      400,
      300,
    );
    const pairs = result.walls.filter((w) => w.kind === "raster-paired-faces");
    expect(pairs).toHaveLength(2);
    expect(coverage([80, 45, 150, 45], pairs, 1)).toBe(1);
    expect(coverage([200, 45, 320, 45], pairs, 1)).toBe(1);
    expect(
      pairs.every(
        (w) =>
          Math.max(w.start.x, w.end.x) <= 150 ||
          Math.min(w.start.x, w.end.x) >= 200,
      ),
    ).toBe(true);
  });
  it("un reticolo scuro regolare non diventa una stanza automatica", () => {
    const lines: number[][] = [];
    for (let i = 80; i <= 520; i += 40)
      lines.push([80, i, 520, i, 7, 0], [i, 80, i, 520, 7, 0]);
    expect(
      recognizeRaster(draw(lines, 600, 600), 600, 600).walls.filter(
        (w) => w.confidence >= 0.9,
      ),
    ).toEqual([]);
  });
  it("rifiuta dati non validi; bianco, trasparenza e campiture uniformi restano senza muri", () => {
    expect(() => recognizeRaster(new Uint8ClampedArray(4), NaN, 1)).toThrow();
    expect(() => recognizeRaster(new Uint8ClampedArray(4), 400, 300)).toThrow();
    for (const gray of [0, 180, 255]) {
      const pixels = new Uint8ClampedArray(400 * 300 * 4);
      for (let i = 0; i < pixels.length; i += 4)
        pixels.set([gray, gray, gray, gray === 0 ? 0 : 255], i);
      expect(recognizeRaster(pixels, 400, 300).walls).toEqual([]);
    }
  });
});
