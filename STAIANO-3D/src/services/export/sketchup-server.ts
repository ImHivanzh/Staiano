import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { nativeDwgRuntime } from "@/services/import/dwg-native";
import { MAX_SKETCHUP_BYTES, sketchupModelSchema } from "./sketchup-schema";

let busy = false;
export async function sketchupRuntime() {
  if (process.platform !== "win32") return null;
  const dotnet = await nativeDwgRuntime();
  const assembly = path.resolve("native/runtime/SketchUpBridge.dll");
  if (!dotnet || !(await stat(assembly).catch(() => null))?.isFile())
    return null;
  const configured = process.env.SKETCHUP_API_DIR;
  const root = path.join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "SketchUp",
  );
  const folders = configured
    ? []
    : await readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = configured
    ? [configured]
    : folders
        .filter((d) => d.isDirectory() && /^SketchUp 20\d\d$/.test(d.name))
        .map((d) => d.name)
        .toSorted((a, b) => b.localeCompare(a))
        .flatMap((name) => [
          path.join(root, name, "SketchUp"),
          path.join(root, name),
        ]);
  for (const directory of candidates) {
    if (!path.isAbsolute(directory)) continue;
    const api = path.join(directory, "SketchUpAPI.dll");
    if ((await stat(api).catch(() => null))?.isFile())
      return { executable: dotnet.executable, assembly, api };
  }
  return null;
}

export async function readSketchupRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw Error("Formato modello non valido.");
  const reader = request.body?.getReader();
  if (!reader) throw Error("Modello vuoto.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => {
    void reader.cancel();
  }, 30000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_SKETCHUP_BYTES)
        throw Error("Modello troppo grande per SKP (massimo 64 MB).");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function exportSketchup(input: unknown) {
  const model = sketchupModelSchema.parse(input);
  const runtime = await sketchupRuntime();
  if (!runtime)
    throw Error(
      "Esportazione SKP richiede SketchUp installato su questo PC e il bridge locale compilato.",
    );
  if (busy)
    throw Error("Esportazione SKP già in corso. Attendi il completamento.");
  busy = true;
  const root = path.resolve(".cache/sketchup");
  let work: string | undefined;
  try {
    await mkdir(root, { recursive: true });
    work = await mkdtemp(path.join(root, "export-"));
    let background = null;
    if (model.background) {
      const data = model.background;
      if (!data.dataUrl.startsWith("data:image/png;base64,"))
        throw Error("Lo sfondo SKP deve essere convertito in PNG.");
      const bytes = Buffer.from(
        data.dataUrl.slice(data.dataUrl.indexOf(",") + 1),
        "base64",
      );
      if (
        bytes.length < 24 ||
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.readUInt32BE(16) !== data.widthPx ||
        bytes.readUInt32BE(20) !== data.heightPx ||
        data.widthPx * data.heightPx > 40000000
      )
        throw Error("Sfondo planimetria non valido.");
      const file = path.join(work, "plan.png");
      await writeFile(file, bytes);
      background = {
        file,
        widthM: data.widthPx * data.metersPerPixel,
        heightM: data.heightPx * data.metersPerPixel,
        x: data.origin.x,
        y: data.origin.y,
      };
    }
    const source = path.join(work, "model.json"),
      output = path.join(work, "model.skp");
    await writeFile(
      source,
      JSON.stringify({ name: model.name, meshes: model.meshes, background }),
    );
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        runtime.executable,
        [runtime.assembly, runtime.api, source, output],
        {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let errorText = "",
        expired = false;
      child.stderr.on("data", (chunk) => {
        if (errorText.length < 2000) errorText += String(chunk);
      });
      const timeout = setTimeout(() => {
        expired = true;
        child.kill();
      }, 120000);
      child.once("error", () => {
        clearTimeout(timeout);
        reject(Error("Avvio del bridge SketchUp non riuscito."));
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0 && !expired) resolve();
        else
          reject(
            Error(
              expired
                ? "Esportazione SKP troppo lenta. Riduci il modello e riprova."
                : errorText.trim() || "Esportazione SKP non riuscita.",
            ),
          );
      });
    });
    const result = await stat(output);
    if (result.size < 100 || result.size > MAX_SKETCHUP_BYTES)
      throw Error("File SKP non valido o troppo grande.");
    return new Uint8Array(await readFile(output));
  } finally {
    if (work && path.dirname(path.resolve(work)) === root)
      await rm(work, { recursive: true, force: true }).catch(() => {});
    busy = false;
  }
}
