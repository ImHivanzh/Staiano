import * as ort from "onnxruntime-web/webgpu";
import { parseDxf } from "@/services/import/dxf";
import {
  analyzeRasterPixels,
  analyzeVectorPlan,
} from "@/domain/geometry/plan-analysis";
import {
  normalizePlanImage,
  rotatePlanTensor,
  semanticWallMask,
  suppressPlanAnnotations,
} from "@/domain/geometry/plan-segmentation";
import type { ParsedPlan } from "@/services/import/plan-types";

type AnalysisRequest = {
  kind: "analyze";
  plan: ParsedPlan;
  pixels?: Uint8ClampedArray;
  width: number;
  height: number;
};

const MODEL_SIZE = 512;
const MODEL_URL = "/models/floorplan-unet.onnx";

ort.env.logLevel = "error";
ort.env.wasm.wasmPaths = "/workers/";
// No cross-origin isolation in the app, so keep the CPU fallback single-threaded.
ort.env.wasm.numThreads = 1;
ort.env.webgpu.powerPreference = "high-performance";

type LoadedModel = {
  session: Awaited<ReturnType<typeof ort.InferenceSession.create>>;
  provider: "WebGPU" | "CPU";
};

let modelPromise: Promise<LoadedModel> | undefined;

function loadModel() {
  modelPromise ??= (async () => {
    const response = await fetch(MODEL_URL);
    if (!response.ok)
      throw new Error(`Modello AI non disponibile (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if ("gpu" in navigator) {
      try {
        return {
          session: await ort.InferenceSession.create(bytes, {
            executionProviders: ["webgpu"],
            graphOptimizationLevel: "all",
          }),
          provider: "WebGPU" as const,
        };
      } catch (error) {
        console.warn("WebGPU non disponibile, uso la CPU.", error);
      }
    }
    return {
      session: await ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
      provider: "CPU" as const,
    };
  })().catch((error) => {
    modelPromise = undefined;
    throw error;
  });
  return modelPromise;
}

/** Letterbox onto the training background and return a wall mask at source size. */
async function segmentWalls(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const { session, provider } = await loadModel();
  const source = new ImageData(
    new Uint8ClampedArray(
      pixels.buffer as ArrayBuffer,
      pixels.byteOffset,
      pixels.length,
    ),
    width,
    height,
  );
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(MODEL_SIZE, MODEL_SIZE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Anteprima AI non disponibile.");
  const scale = Math.min(MODEL_SIZE / width, MODEL_SIZE / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const left = Math.floor((MODEL_SIZE - drawWidth) / 2);
  const top = Math.floor((MODEL_SIZE - drawHeight) / 2);
  context.fillStyle = "rgb(124, 116, 104)";
  context.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "white";
  context.fillRect(left, top, drawWidth, drawHeight);
  context.drawImage(bitmap, left, top, drawWidth, drawHeight);
  bitmap.close();
  const data = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const input = normalizePlanImage(data, MODEL_SIZE, MODEL_SIZE, {
    left,
    top,
    width: drawWidth,
    height: drawHeight,
  });
  // Read all four orthogonal orientations with the same local weights.
  const logits = new Float32Array(4 * MODEL_SIZE * MODEL_SIZE);
  for (let turn = 0; turn < 4; turn++) {
    const output = await session.run({
      image: new ort.Tensor(
        "float32",
        rotatePlanTensor(input, 3, MODEL_SIZE, turn),
        [1, 3, MODEL_SIZE, MODEL_SIZE],
      ),
    });
    const aligned = rotatePlanTensor(
      output.logits.data as Float32Array,
      4,
      MODEL_SIZE,
      (4 - turn) % 4,
    );
    if (aligned.length !== logits.length)
      throw new Error("Risposta del modello AI non valida.");
    for (let i = 0; i < logits.length; i++) logits[i] += aligned[i] / 4;
    output.logits.dispose();
  }
  const wall = suppressPlanAnnotations(
    semanticWallMask(logits, MODEL_SIZE, MODEL_SIZE),
    input,
    MODEL_SIZE,
    MODEL_SIZE,
  );
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const my = Math.floor(top + ((y + 0.5) * drawHeight) / height);
    if (my < top || my >= top + drawHeight) continue;
    for (let x = 0; x < width; x++) {
      const mx = Math.floor(left + ((x + 0.5) * drawWidth) / width);
      if (mx < left || mx >= left + drawWidth) continue;
      mask[y * width + x] = wall[my * MODEL_SIZE + mx];
    }
  }
  return { mask, provider };
}

async function analyze(request: AnalysisRequest) {
  const { plan, pixels, width, height } = request;
  const vector = analyzeVectorPlan(plan);
  if (!pixels) return { ok: true, vector, raster: null };
  let semanticMask: Uint8Array | undefined;
  let provider: string | undefined;
  try {
    const segmented = await segmentWalls(pixels, width, height);
    semanticMask = segmented.mask;
    provider = segmented.provider;
  } catch (error) {
    console.warn(
      "Segmentazione AI non riuscita, uso l’analisi euristica.",
      error,
    );
  }
  const raster = analyzeRasterPixels(pixels, width, height, true, semanticMask);
  raster.notes.unshift(
    semanticMask
      ? `Segmentazione AI locale (${provider}): muri, arredi e testo separati prima della vettorizzazione.`
      : "Modello AI non disponibile: analisi euristica di riserva. Verificare ogni muro proposto.",
  );
  return { ok: true, vector, raster };
}

self.onmessage = async (
  event: MessageEvent<
    { text: string; filename: string; sizeBytes: number } | AnalysisRequest
  >,
) => {
  try {
    if ("kind" in event.data) {
      self.postMessage(await analyze(event.data));
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
      error: error instanceof Error ? error.message : "Analisi non riuscita.",
    });
  }
};
