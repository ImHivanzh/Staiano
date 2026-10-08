import type { ParsedPlan } from "./plan-types";
import type { Point } from "@/schemas/project";
import type { PlanAnalysis } from "@/domain/geometry/plan-analysis";

async function recognize(
  plan: ParsedPlan,
  pixels?: Uint8ClampedArray,
  width = 0,
  height = 0,
) {
  return new Promise<{ vector: PlanAnalysis; raster: PlanAnalysis | null }>(
    (resolve, reject) => {
      const worker = new Worker(
        new URL("../../workers/plan.worker.ts", import.meta.url),
        { type: "module" },
      );
      const finish = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      const timeout = setTimeout(() => {
        finish();
        reject(
          new Error(
            "Analisi troppo complessa: selezionare una sola planimetria.",
          ),
        );
      }, 30000);
      worker.onmessage = (
        event: MessageEvent<{
          ok: boolean;
          vector: PlanAnalysis;
          raster: PlanAnalysis | null;
          error?: string;
        }>,
      ) => {
        finish();
        if (event.data.ok) resolve(event.data);
        else
          reject(new Error(event.data.error ?? "Riconoscimento non riuscito."));
      };
      worker.onerror = () => {
        finish();
        reject(
          new Error(
            "Analisi interrotta: riprova o seleziona un’area più piccola.",
          ),
        );
      };
      worker.postMessage(
        {
          kind: "analyze",
          plan: { ...plan, background: null, originalDataUrl: undefined },
          pixels,
          width,
          height,
        },
        pixels ? [pixels.buffer] : [],
      );
    },
  );
}

export async function analyzePlan(
  plan: ParsedPlan,
  region?: { start: Point; end: Point },
): Promise<PlanAnalysis> {
  const source = {
    ...plan,
    segments: plan.segments.filter(
      (s) =>
        s.layer !== "Muri riconosciuti" && s.layer !== "Contorni da verificare",
    ),
  };
  if (
    !plan.background ||
    (plan.sourceType !== "pdf" && plan.sourceType !== "raster")
  )
    return (await recognize(source)).vector;
  const img = new Image();
  img.src = plan.background.dataUrl;
  await img.decode();
  const left = region ? Math.max(0, Math.min(region.start.x, region.end.x)) : 0;
  const top = region ? Math.max(0, Math.min(region.start.y, region.end.y)) : 0;
  const sourceWidth = region
    ? Math.min(img.width, Math.max(region.start.x, region.end.x)) - left
    : img.width;
  const sourceHeight = region
    ? Math.min(img.height, Math.max(region.start.y, region.end.y)) - top
    : img.height;
  if (
    ![left, top, sourceWidth, sourceHeight].every(Number.isFinite) ||
    sourceWidth < 8 ||
    sourceHeight < 8
  )
    throw new Error("Selezionare un’area di almeno 8 pixel per lato.");
  const factor = Math.min(1, 2200 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * factor));
  canvas.height = Math.max(1, Math.round(sourceHeight * factor));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Analisi raster non disponibile: usare l’editor manuale.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    img,
    left,
    top,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const { vector, raster } = await recognize(
    source,
    context.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
  const result = raster!;
  const map = (p: { x: number; y: number }) => ({
    x: left + (p.x * sourceWidth) / canvas.width,
    y: top + (p.y * sourceHeight) / canvas.height,
  });
  // A vector PDF retains exact coordinates when parallel wall faces exist.
  // Raster evidence handles scans, filled-only paths and mixed PDFs instead of
  // letting a decorative vector line suppress recognition of the entire image.
  if (
    !region &&
    vector.walls.filter((w) => w.kind === "paired-faces").length >= 3 &&
    vector.walls.filter((w) => w.kind === "paired-faces").length /
      vector.walls.length >=
      0.6 &&
    !result.walls.some((w) => w.confidence >= 0.9)
  )
    return vector;
  if (!region && !result.walls.length && vector.walls.length) return vector;
  return {
    ...result,
    walls: result.walls.map((w) => ({
      ...w,
      start: map(w.start),
      end: map(w.end),
      thicknessUnits:
        w.thicknessUnits === null ? null : w.thicknessUnits / factor,
    })),
    openings: result.openings.map((o) => ({
      ...o,
      start: map(o.start),
      end: map(o.end),
    })),
  };
}
