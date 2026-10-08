import { parseDxf } from "@/services/import/dxf";
import {
  analyzeRasterPixels,
  analyzeVectorPlan,
} from "@/domain/geometry/plan-analysis";
import type { ParsedPlan } from "@/services/import/plan-types";
type AnalysisRequest = {
  kind: "analyze";
  plan: ParsedPlan;
  pixels?: Uint8ClampedArray;
  width: number;
  height: number;
};
self.onmessage = (
  event: MessageEvent<
    { text: string; filename: string; sizeBytes: number } | AnalysisRequest
  >,
) => {
  try {
    if ("kind" in event.data) {
      const { plan, pixels, width, height } = event.data;
      self.postMessage({
        ok: true,
        vector: analyzeVectorPlan(plan),
        raster: pixels ? analyzeRasterPixels(pixels, width, height) : null,
      });
      return;
    }
    self.postMessage({
      ok: true,
      plan: parseDxf(
        event.data.text,
        event.data.filename,
        event.data.sizeBytes,
      ),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "DXF non leggibile.",
    });
  }
};
