import type { ParsedPlan } from "./plan-types";
import type { Point } from "@/schemas/project";
import type { PlanAnalysis } from "@/domain/geometry/plan-analysis";
import { reconstructionSchema } from "./reconstruction-schema";
import { reconstructPlan2D } from "@/domain/geometry/automatic-plan";

async function recognize(
  plan: ParsedPlan,
  pixels?: Uint8ClampedArray,
  width = 0,
  height = 0,
) {
  return new Promise<{ vector: PlanAnalysis; raster: PlanAnalysis | null }>(
    (resolve, reject) => {
      const worker = new Worker("/workers/plan.worker.js", { type: "module" });
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
      }, 120000);
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
          plan: {
            ...plan,
            background: null,
            originalDataUrl: undefined,
            analysisDataUrl: undefined,
          },
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
  signal?: AbortSignal,
): Promise<PlanAnalysis> {
  signal?.throwIfAborted();
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
  img.src = plan.analysisDataUrl ?? plan.background.dataUrl;
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
  let result = raster!;
  try {
    const status = await fetch("/api/import/reconstruct", {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
        : AbortSignal.timeout(5000),
    });
    if (status.ok && (await status.json()).available) {
      const body = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(Error("Immagine della planimetria non disponibile.")),
          "image/png",
        ),
      );
      const response = await fetch("/api/import/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(150000)])
          : AbortSignal.timeout(150000),
      });
      const output = await response.json();
      if (!response.ok)
        throw Error(output.message ?? "Ricostruzione 2D non riuscita.");
      result = reconstructPlan2D(reconstructionSchema.parse(output), result);
    }
  } catch {
    signal?.throwIfAborted();
    result.notes.unshift(
      "Ricostruzione delle stanze non disponibile: sono conservati i muri riconosciuti localmente. Puoi riprovare selezionando un’area più piccola.",
    );
  }
  const map = (p: { x: number; y: number }) => ({
    x: left + (p.x * sourceWidth) / canvas.width,
    y: top + (p.y * sourceHeight) / canvas.height,
  });
  // A vector PDF retains exact coordinates when parallel wall faces exist.
  // Raster evidence handles scans, filled-only paths and mixed PDFs instead of
  // letting a decorative vector line suppress recognition of the entire image.
  if (
    !result.reconstructed &&
    !region &&
    vector.walls.filter((w) => w.kind === "paired-faces").length >= 3 &&
    vector.walls.filter((w) => w.kind === "paired-faces").length /
      vector.walls.length >=
      0.6 &&
    !result.walls.some((w) => w.confidence >= 0.9)
  )
    return vector;
  if (!region && !result.walls.length && vector.walls.length) return vector;
  const analysis = { ...result };
  delete analysis.imageWalls;
  return {
    ...analysis,
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
