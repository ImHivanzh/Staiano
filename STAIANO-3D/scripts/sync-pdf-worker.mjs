import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("public/workers/", root), { recursive: true });
for (const [source, target] of [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/workers/pdf.worker.min.mjs"],
  ["node_modules/pdfjs-dist/LICENSE", "public/workers/PDFJS-LICENSE.txt"],
]) await copyFile(fileURLToPath(new URL(source, root)), fileURLToPath(new URL(target, root)));
