import type { ParsedPlan } from "./plan-types";
import {
  analyzeRasterPixels,
  analyzeVectorPlan,
  type PlanAnalysis,
} from "@/domain/geometry/plan-analysis";

export async function analyzePlan(plan: ParsedPlan): Promise<PlanAnalysis> {
  if (plan.segments.length) return analyzeVectorPlan(plan);
  if (!plan.background)
    return {
      walls: [],
      openings: [],
      notes: ["Nessun raster o tracciato disponibile."],
    };
  const img = new Image();
  img.src = plan.background.dataUrl;
  await img.decode();
  const factor = Math.min(1, 1200 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * factor));
  canvas.height = Math.max(1, Math.round(img.height * factor));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Analisi raster non disponibile: usare l’editor manuale.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const result = analyzeRasterPixels(
    context.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
  const map = (p: { x: number; y: number }) => ({
    x: (p.x * img.width) / canvas.width,
    y: (p.y * img.height) / canvas.height,
  });
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
