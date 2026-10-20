import { copyFile, mkdir, stat } from "node:fs/promises";
import { build } from "esbuild";

const model = await stat("public/models/floorplan-unet.onnx").catch(() => null);
if (!model || model.size < 90_000_000)
  throw new Error(
    "Modello di segmentazione mancante: public/models/floorplan-unet.onnx",
  );
await mkdir("public/workers", { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
])
  await copyFile(
    `node_modules/onnxruntime-web/dist/${file}`,
    `public/workers/${file}`,
  );
await build({
  entryPoints: {
    "plan.worker": "src/workers/plan.worker.ts",
    "project.worker": "src/workers/project.worker.ts",
    "size.worker": "src/domain/radiators/size.worker.ts",
  },
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: "es2022",
  outdir: "public/workers",
});
