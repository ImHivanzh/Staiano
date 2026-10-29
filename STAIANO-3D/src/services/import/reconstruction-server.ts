import { spawn, type ChildProcess } from "node:child_process";
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
import { recognizerDefaults, setupState } from "./plan-recognizer-setup";

const runtimeSchema = z.object({
  python: z.string(),
  source: z.string(),
  checkpoint: z.string(),
});
let busy = false;
type AiStatus = {
  available: boolean;
  state:
    | "unavailable"
    | "preparing"
    | "installed"
    | "ready"
    | "busy"
    | "error";
  message: string;
  device?: "cuda" | "cpu";
};
let checking: Promise<AiStatus> | null = null;
function stopRecognizer(child: ChildProcess) {
  if (process.platform === "win32" && child.pid) {
    spawn(
      path.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32/taskkill.exe",
      ),
      ["/PID", String(child.pid), "/T", "/F"],
      { shell: false, windowsHide: true, stdio: "ignore" },
    ).once("error", () => child.kill());
  } else child.kill();
}

/** Installation and an explicit dependency check are distinct from loading the model. */
export const recognizerBusy = () => busy;
export async function recognitionAiStatus(check = false): Promise<AiStatus> {
  const setup = setupState();
  if (setup?.state === "running")
    return {
      available: false,
      state: "preparing",
      message:
        "Preparazione della ricostruzione avanzata in corso: scarico modello e librerie (diversi GB, anche decine di minuti). Il riconoscimento nel browser resta disponibile.",
    };
  const runtime = await planRecognizerRuntime();
  if (!runtime)
    return {
      available: false,
      state: setup?.state === "error" ? "error" : "unavailable",
      message:
        setup?.message ??
        "Ricostruzione avanzata non configurata su questo server. Il riconoscimento nel browser resta disponibile.",
    };
  if (busy)
    return {
      available: true,
      state: "busy",
      message: "Ricostruzione avanzata attiva: analisi in corso.",
    };
  if (!check)
    return {
      available: true,
      state: "installed",
      message:
        "Runtime installato. Usa Verifica AI per controllare Python e dipendenze.",
    };
  if (checking) return checking;
  checking = (async () => {
    try {
      const result = await new Promise<{ ok: boolean; device: "cuda" | "cpu" }>(
        (resolve, reject) => {
          const child = spawn(
            runtime.python,
            [
              "-c",
              'import json,sys,torch,torchvision,cv2,numpy,PIL,fvcore,scipy; print(json.dumps({"ok":sys.version_info[:2]==(3,12),"device":"cuda" if torch.cuda.is_available() else "cpu"}))',
            ],
            {
              shell: false,
              windowsHide: true,
              stdio: ["ignore", "pipe", "ignore"],
            },
          );
          let output = "";
          const timer = setTimeout(() => {
            stopRecognizer(child);
            reject(Error("Verifica scaduta"));
          }, 15000);
          child.stdout.on("data", (chunk) => {
            output += chunk.toString();
            if (output.length > 4096) {
              stopRecognizer(child);
              clearTimeout(timer);
              reject(Error("Risposta non valida"));
            }
          });
          child.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
              reject(Error("Python non disponibile"));
              return;
            }
            try {
              resolve(JSON.parse(output.trim().split(/\r?\n/).at(-1)!));
            } catch {
              reject(Error("Risposta non valida"));
            }
          });
        },
      );
      if (!result.ok || !["cuda", "cpu"].includes(result.device))
        throw Error("Python 3.12 richiesto");
      return {
        available: true,
        state: "ready" as const,
        device: result.device,
        message: `Ambiente AI pronto (${result.device === "cuda" ? "GPU CUDA" : "CPU"}). Il modello viene caricato durante la ricostruzione.`,
      };
    } catch {
      return {
        available: false,
        state: "error" as const,
        message:
          "Python 3.12 o le dipendenze AI non funzionano. Ripristina il runtime con la procedura di attivazione e ripeti la verifica.",
      };
    }
  })();
  try {
    return await checking;
  } finally {
    checking = null;
  }
}
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
        // A Windows venv launcher owns the actual Python process as a child.
        stopRecognizer(child);
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
