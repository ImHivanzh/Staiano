import * as ort from "onnxruntime-web/webgpu";
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

const MODEL_SIZE = 512;
const MODEL_URL = "/models/floorplan-unet.onnx";
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

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
  context.drawImage(bitmap, left, top, drawWidth, drawHeight);
  bitmap.close();
  const data = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const plane = MODEL_SIZE * MODEL_SIZE;
  // Faded scans can make walls look like windows. Stretch the drawn area back
  // to black/white before inference; flat images keep their original values.
  const histogram = new Uint32Array(256);
  for (let y = top; y < top + drawHeight; y++)
    for (let x = left; x < left + drawWidth; x++) {
      const i = (y * MODEL_SIZE + x) * 4;
      histogram[
        Math.round(
          data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722,
        )
      ]++;
    }
  const drawn = drawWidth * drawHeight;
  const percentile = (fraction: number) => {
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += histogram[value];
      if (seen >= drawn * fraction) return value;
    }
    return 255;
  };
  const low = percentile(0.005),
    high = percentile(0.995);
  const stretch = low > 24 && high - low > 48 ? 255 / (high - low) : 1;
  const input = new Float32Array(3 * plane);
  for (let y = 0; y < MODEL_SIZE; y++)
    for (let x = 0; x < MODEL_SIZE; x++) {
      const i = y * MODEL_SIZE + x;
      const inside =
        x >= left && x < left + drawWidth && y >= top && y < top + drawHeight;
      for (let channel = 0; channel < 3; channel++)
        input[channel * plane + i] =
          ((inside
            ? Math.max(
                0,
                Math.min(255, (data[i * 4 + channel] - low) * stretch),
              )
            : data[i * 4 + channel]) /
            255 -
            MEAN[channel]) /
          STD[channel];
    }
  const output = await session.run({
    image: new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]),
  });
  const logits = output.logits.data as Float32Array;
  if (logits.length !== 4 * plane)
    throw new Error("Risposta del modello AI non valida.");
  const wall = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0;
    for (let channel = 1; channel < 4; channel++)
      if (logits[channel * plane + i] > logits[best * plane + i])
        best = channel;
    // Windows sit on exterior walls; keeping them closes the envelope. Doors
    // stay openings because their arcs and leaves are not structural.
    wall[i] = best === 1 || best === 3 ? 1 : 0;
  }
  // A single downscaled cell missing from a wall would split its vector line.
  for (let y = 1; y < MODEL_SIZE - 1; y++)
    for (let x = 1; x < MODEL_SIZE - 1; x++) {
      const i = y * MODEL_SIZE + x;
      if (
        !wall[i] &&
        ((wall[i - 1] && wall[i + 1]) ||
          (wall[i - MODEL_SIZE] && wall[i + MODEL_SIZE]))
      )
        wall[i] = 1;
    }
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
