import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { reconstructionSchema } from "./reconstruction-schema";

const runtimeSchema = z.object({
  python: z.string(),
  source: z.string(),
  checkpoint: z.string(),
});
let busy = false;
export async function planRecognizerRuntime() {
  const file = path.resolve("native/runtime/plan-ai.json");
  const config = runtimeSchema.safeParse(
    await readFile(file, "utf8")
      .then((text) => JSON.parse(text.replace(/^\uFEFF/, "")))
      .catch(() => null),
  );
  if (!config.success) return null;
  const runtime = config.data;
  for (const file of [
    runtime.python,
    path.join(runtime.source, "models/raster2seq.py"),
    runtime.checkpoint,
  ])
    if (
      !path.isAbsolute(file) ||
      !(
        await stat(/* turbopackIgnore: true */ file).catch(() => null)
      )?.isFile()
    )
      return null;
  return runtime;
}

export async function reconstructImage(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "image/png")
    throw Error("Inviare una planimetria PNG.");
  const runtime = await planRecognizerRuntime();
  if (!runtime)
    throw Error("Ricostruzione 2D avanzata non disponibile su questo server.");
  if (busy)
    throw Error("Ricostruzione 2D già in corso. Attendi il completamento.");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Planimetria vuota.");
  const chunks: Uint8Array[] = [];
  let size = 0,
    expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel();
  }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 24 * 1024 * 1024)
        throw Error("Planimetria troppo grande (massimo 24 MB).");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
  }
  if (expired) throw Error("Caricamento della planimetria scaduto.");
  const bytes = Buffer.concat(chunks);
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw Error("Immagine PNG non valida.");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (
    width < 8 ||
    height < 8 ||
    width > 2200 ||
    height > 2200 ||
    width * height > 5_000_000
  )
    throw Error("Dimensioni della planimetria non valide.");
  if (busy)
    throw Error("Ricostruzione 2D già in corso. Attendi il completamento.");
  busy = true;
  const root = path.resolve(".cache/plan-recognition");
  let work: string | undefined;
  try {
    await mkdir(root, { recursive: true });
    work = await mkdtemp(path.join(root, "plan-"));
    const input = path.join(work, "plan.png"),
      output = path.join(work, "result.json");
    await writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        runtime.python,
        [
          path.resolve("native/PlanRecognizer/recognize.py"),
          "--source",
          runtime.source,
          "--checkpoint",
          runtime.checkpoint,
          "--input",
          input,
          "--output",
          output,
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let failure: Error | undefined;
      const stop = (error: Error) => {
        if (failure) return;
        failure = error;
        if (process.platform === "win32" && child.pid) {
          // A Windows venv launcher owns the actual Python process as a child.
          spawn(
            path.join(
              process.env.SystemRoot ?? "C:\\Windows",
              "System32/taskkill.exe",
            ),
            ["/PID", String(child.pid), "/T", "/F"],
            { shell: false, windowsHide: true, stdio: "ignore" },
          ).once("error", () => child.kill());
        } else child.kill();
      };
      const timer = setTimeout(
        () =>
          stop(
            Error(
              "Ricostruzione 2D troppo lenta. Seleziona un’area più piccola.",
            ),
          ),
        120000,
      );
      const abort = () => stop(Error("Ricostruzione 2D annullata."));
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
      // Drain diagnostics without retaining drawings or model paths in logs.
      child.stderr.on("data", () => {});
      child.once("error", (error) => {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
        if (!failure && code === 0) resolve();
        else
          reject(
            failure ??
              Error("Il modello non ha completato la ricostruzione 2D."),
          );
      });
    });
    if ((await stat(output)).size > 4 * 1024 * 1024)
      throw Error("Ricostruzione 2D troppo complessa.");
    const result = reconstructionSchema.parse(
      JSON.parse(await readFile(output, "utf8")),
    );
    if (result.width !== width || result.height !== height)
      throw Error("Coordinate della ricostruzione non coerenti.");
    return result;
  } finally {
    busy = false;
    if (work) await rm(work, { recursive: true, force: true });
  }
}
