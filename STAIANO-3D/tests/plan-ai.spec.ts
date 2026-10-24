import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { test, expect } from "./browser-test";
import type corpusMetadata from "./fixtures/plan-recognition/manifest.json";
import type { PlanAnalysis } from "../src/domain/geometry/plan-analysis";
const corpus: typeof corpusMetadata = JSON.parse(
  readFileSync("tests/fixtures/plan-recognition/manifest.json", "utf8"),
);

test("local AI recognizes reference walls on five real plans without sending their pixels to a server", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await page.goto("/");
  const samples = corpus.map((sample) => ({
    ...sample,
    pixels: gunzipSync(
      readFileSync(`tests/fixtures/plan-recognition/${sample.file}`),
    ).toString("base64"),
  }));
  const results = await page.evaluate(async (samples) => {
    const worker = new Worker("/workers/plan.worker.js", { type: "module" });
    const results: {
      id: string;
      analysis: PlanAnalysis;
      milliseconds: number;
    }[] = [];
    try {
      for (const sample of samples) {
        const pixels = Uint8ClampedArray.from(atob(sample.pixels), (c) =>
          c.charCodeAt(0),
        );
        const started = performance.now();
        const analysis = await new Promise<PlanAnalysis>((resolve, reject) => {
          worker.onerror = (event) => reject(Error(event.message));
          worker.onmessage = (event) =>
            event.data.ok
              ? resolve(event.data.raster)
              : reject(Error(event.data.error));
          worker.postMessage(
            {
              kind: "analyze",
              plan: { segments: [], suggestedMetersPerUnit: null },
              pixels,
              width: sample.width,
              height: sample.height,
            },
            [pixels.buffer],
          );
        });
        results.push({
          id: sample.id,
          analysis,
          milliseconds: performance.now() - started,
        });
      }
      return results;
    } finally {
      worker.terminate();
    }
  }, samples);
  const metrics = results.map((result, index) => {
    const sample = samples[index];
    let hits = 0,
      total = 0;
    for (const [x, y, x2, y2] of sample.wallProbes)
      for (let i = 0; i <= 30; i++) {
        total++;
        const px = x + ((x2 - x) * i) / 30,
          py = y + ((y2 - y) * i) / 30;
        if (
          result.analysis.walls.some((wall) => {
            const dx = wall.end.x - wall.start.x,
              dy = wall.end.y - wall.start.y;
            const length = Math.hypot(dx, dy),
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((px - wall.start.x) * dx + (py - wall.start.y) * dy) /
                    (length * length),
                ),
              );
            return (
              Math.abs(
                (dx * (x2 - x) + dy * (y2 - y)) /
                  (length * Math.hypot(x2 - x, y2 - y)),
              ) > 0.99 &&
              Math.hypot(
                px - wall.start.x - t * dx,
                py - wall.start.y - t * dy,
              ) <= sample.tolerancePx
            );
          })
        )
          hits++;
      }
    return {
      ...result,
      coverage: hits / total,
      candidates: result.analysis.walls.length,
    };
  });
  for (const [index, result] of results.entries()) {
    const overlay = await page.evaluate(
      ({ sample, walls }) => {
        const canvas = document.createElement("canvas");
        canvas.width = sample.width;
        canvas.height = sample.height;
        const context = canvas.getContext("2d")!;
        context.putImageData(
          new ImageData(
            Uint8ClampedArray.from(atob(sample.pixels), (c) => c.charCodeAt(0)),
            sample.width,
            sample.height,
          ),
          0,
          0,
        );
        context.strokeStyle = "#e04a2f";
        context.lineWidth = 2;
        for (const wall of walls) {
          context.beginPath();
          context.moveTo(wall.start.x, wall.start.y);
          context.lineTo(wall.end.x, wall.end.y);
          context.stroke();
        }
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { sample: samples[index], walls: result.analysis.walls },
    );
    const path = info.outputPath(`${result.id}.png`);
    await writeFile(path, Buffer.from(overlay, "base64"));
    await info.attach(result.id, { path, contentType: "image/png" });
  }
  await info.attach("AI reference coverage", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log(
    JSON.stringify(
      metrics.map(({ id, coverage, candidates, milliseconds }) => ({
        id,
        coverage,
        candidates,
        milliseconds,
      })),
    ),
  );
  for (const [index, result] of metrics.entries()) {
    expect(result.analysis.notes[0]).toContain("Segmentazione AI locale");
    expect(result.coverage, result.id).toBeGreaterThanOrEqual(
      samples[index].minimumCoverage,
    );
    if (result.id === "unite-barn")
      expect(
        result.analysis.walls.filter((wall) => {
          const x = (wall.start.x + wall.end.x) / 2,
            y = (wall.start.y + wall.end.y) / 2;
          return (
            wall.layer !== "Contorni da verificare" &&
            x >= 85 &&
            x <= 225 &&
            y >= 270 &&
            y <= 310
          );
        }),
        "La scritta PORTICO non è un muro confermato",
      ).toHaveLength(0);
  }
});
