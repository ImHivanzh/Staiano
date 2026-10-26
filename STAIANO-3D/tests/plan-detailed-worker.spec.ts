import { test, expect } from "./browser-test";

test("immagine grande: il worker locale integra ritagli sovrapposti senza perdere le coordinate", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const width = 1600,
      height = 1000,
      canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "black";
    ctx.lineWidth = 14;
    ctx.strokeRect(200, 150, 1200, 700);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    return await new Promise<{
      ok: boolean;
      raster: {
        notes: string[];
        walls: {
          id: string;
          start: { x: number; y: number };
          end: { x: number; y: number };
        }[];
      };
      error?: string;
    }>((resolve, reject) => {
      const worker = new Worker("/workers/plan.worker.js", { type: "module" });
      const timer = setTimeout(() => {
        worker.terminate();
        reject(Error("Rilevamento dettagliato scaduto"));
      }, 100000);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(Error("Worker non disponibile"));
      };
      worker.postMessage(
        {
          kind: "analyze",
          plan: {
            sourceType: "raster",
            segments: [],
            suggestedMetersPerUnit: null,
          },
          pixels,
          width,
          height,
        },
        [pixels.buffer],
      );
    });
  });
  expect(result.ok, result.error).toBe(true);
  expect(result.raster.notes.join(" ")).toContain("ritagli sovrapposti");
  expect(new Set(result.raster.walls.map((w) => w.id)).size).toBe(
    result.raster.walls.length,
  );
  for (const point of [
    { x: 800, y: 150 },
    { x: 800, y: 850 },
    { x: 200, y: 500 },
    { x: 1400, y: 500 },
  ]) {
    expect(
      result.raster.walls.some((w) => {
        const dx = w.end.x - w.start.x,
          dy = w.end.y - w.start.y,
          len = dx * dx + dy * dy;
        if (!len) return false;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - w.start.x) * dx + (point.y - w.start.y) * dy) / len,
          ),
        );
        return (
          Math.hypot(
            point.x - w.start.x - t * dx,
            point.y - w.start.y - t * dy,
          ) < 20
        );
      }),
      JSON.stringify(point),
    ).toBe(true);
  }
});
