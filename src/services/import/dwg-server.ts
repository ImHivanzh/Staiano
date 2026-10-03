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
import { nativeDwgRuntime, executeNativeDwg } from "./dwg-native";

export const MAX_DWG_BYTES = 32 * 1024 * 1024;
const licenceNote =
  "DWG: uso commerciale ODA da autorizzare con licenza aziendale valida. In alternativa esportare DXF ASCII 2D nel proprio CAD.";
let busy = false;

export function validDwgSignature(data: Uint8Array) {
  return (
    data.length >= 64 &&
    /^AC10\d\d$/.test(Buffer.from(data.subarray(0, 6)).toString("ascii"))
  );
}

/** Executable selection is administrator configuration, never request input. */
export async function installedOda(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const configured = process.env.ODA_FILE_CONVERTER_PATH;
  if (configured) {
    if (
      !path.isAbsolute(configured) ||
      path.basename(configured).toLowerCase() !== "odafileconverter.exe"
    )
      return null;
    return (await stat(configured).catch(() => null))?.isFile()
      ? configured
      : null;
  }
  const root = path.join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "ODA",
  );
  const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
  const versions = folders
    .filter(
      (d) => d.isDirectory() && /^ODAFileConverter \d+\.\d+\.\d+$/.test(d.name),
    )
    .map((d) => d.name)
    .toSorted((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const folder of versions) {
    const executable = path.join(root, folder, "ODAFileConverter.exe");
    if ((await stat(executable).catch(() => null))?.isFile()) return executable;
  }
  return null;
}

export async function dwgConverterStatus() {
  const engine = process.env.DWG_IMPORT_ENGINE ?? "auto";
  if (!["auto", "acadsharp", "oda", "disabled"].includes(engine))
    return {
      available: false,
      installed: false,
      licensed: false,
      engine: "disabled",
      converter: null,
      license: null,
      odaCommercialEnabled: false,
      message:
        "Configurazione lettore DWG non valida. Esportare DXF ASCII dal CAD.",
    };
  const native =
    engine !== "oda" && engine !== "disabled" ? await nativeDwgRuntime() : null;
  const odaCommercialEnabled = process.env.ODA_COMMERCIAL_USE_CONFIRMED === "1";
  if (native)
    return {
      available: true,
      installed: true,
      licensed: true,
      engine: "acadsharp",
      converter: "ACadSharp 3.8.0",
      license: "MIT",
      odaCommercialEnabled,
      message:
        "Lettore DWG locale MIT disponibile. Verificare layer, assi e scala prima dell’importazione.",
    };
  if (engine === "disabled" || engine === "acadsharp")
    return {
      available: false,
      installed: false,
      licensed: false,
      engine: "disabled",
      converter: null,
      license: null,
      odaCommercialEnabled,
      message: "Import DWG disattivato. Esportare DXF ASCII 2D dal CAD.",
    };
  const executable = await installedOda();
  const licensed = process.env.ODA_COMMERCIAL_USE_CONFIRMED === "1";
  return {
    available: Boolean(executable && licensed),
    installed: Boolean(executable),
    licensed,
    engine: "oda",
    license: licensed ? "ODA commerciale" : null,
    odaCommercialEnabled,
    converter: executable ? path.basename(path.dirname(executable)) : null,
    message: !licensed
      ? licenceNote
      : !executable
        ? "Convertitore DWG autorizzato non disponibile. Esportare DXF ASCII 2D."
        : "Conversione DWG locale con ODA autorizzato; verificare layer, geometrie e scala.",
  };
}

function executeOda(
  executable: string,
  input: string,
  output: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [input, output, "ACAD2018", "DXF", "0", "1", "input.dwg"],
      { shell: false, windowsHide: true, stdio: "ignore" },
    );
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(
        new Error(
          "Conversione DWG troppo lunga. Ridurre il disegno o esportare DXF ASCII dal CAD.",
        ),
      );
    }, 30000);
    child.once("error", () =>
      finish(new Error("Avvio del convertitore DWG non riuscito.")),
    );
    child.once("exit", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              "DWG non convertibile. Verificare il file nel CAD ed esportare DXF ASCII.",
            ),
      ),
    );
  });
}

export async function convertDwgDetailed(data: Uint8Array) {
  if (data.byteLength > MAX_DWG_BYTES)
    throw new Error("DWG troppo grande. Limite32MB.");
  if (!validDwgSignature(data))
    throw new Error("Il file non contiene un DWG valido.");
  const status = await dwgConverterStatus();
  if (!status.available) throw new Error(status.message);
  const executable = status.engine === "oda" ? await installedOda() : null;
  if (status.engine === "oda" && !executable)
    throw new Error("Convertitore DWG non disponibile.");
  if (busy)
    throw new Error("Conversione DWG già in corso. Riprovare tra poco.");
  busy = true;
  const root = path.resolve(process.cwd(), ".cache", "dwg-import");
  let work: string | undefined;
  try {
    await mkdir(root, { recursive: true });
    work = await mkdtemp(path.join(root, "job-"));
    const input = path.join(work, "input"),
      output = path.join(work, "output");
    await mkdir(input);
    await mkdir(output);
    await writeFile(path.join(input, "input.dwg"), data);
    const result = path.join(output, "input.dxf");
    const metadata =
      status.engine === "acadsharp"
        ? await executeNativeDwg(path.join(input, "input.dwg"), result)
        : (await executeOda(executable!, input, output),
          {
            parser: status.converter ?? "ODA",
            originalVersion: Buffer.from(data.subarray(0, 6)).toString("ascii"),
            warnings: [] as string[],
          });
    const file = await stat(result).catch(() => null);
    if (!file?.isFile() || file.size === 0 || file.size > MAX_DWG_BYTES)
      throw new Error(
        "DXF risultante assente o troppo grande. Esportare un disegno semplificato dal CAD.",
      );
    const text = await readFile(result, "utf8");
    if (
      !/SECTION/.test(text.slice(0, 2000)) ||
      text.startsWith("AutoCAD Binary DXF")
    )
      throw new Error("Conversione senza geometrie DXF ASCII leggibili.");
    return {
      dxf: text,
      parser: metadata.parser,
      originalVersion: metadata.originalVersion,
      warnings: metadata.warnings,
    };
  } finally {
    if (work && path.dirname(work) === root)
      await rm(work, { recursive: true, force: true }).catch(() => {});
    busy = false;
  }
}
export async function convertDwg(data: Uint8Array): Promise<string> {
  return (await convertDwgDetailed(data)).dxf;
}

export function localDwgRequestAllowed(request: Request): boolean {
  const url = new URL(request.url);
  if (
    ![
      "localhost",
      "127.0.0.1",
      "[::1]",
      "hvac.internal.staianopoint.com",
    ].includes(url.hostname)
  )
    return false;
  const origin = request.headers.get("origin");
  const authority =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  if (
    !/^(?:localhost|127\.0\.0\.1|\[::1\]|hvac\.internal\.staianopoint\.com)(?::\d{1,5})?$/.test(
      authority,
    )
  )
    return false;
  const scheme = authority.startsWith("hvac.internal.staianopoint.com")
    ? "https:"
    : url.protocol;
  try {
    const expectedOrigin = new URL(`${scheme}//${authority}`).origin;
    return !origin || origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function boundedDwgBody(request: Request): Promise<Uint8Array> {
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/octet-stream"
  )
    throw new Error("Tipo file DWG non valido.");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_DWG_BYTES))
    throw new Error("DWG troppo grande. Limite32MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("DWG vuoto.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let expired = false;
  const timeout = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 30000);
  try {
    while (true) {
      const result = await reader.read();
      if (expired)
        throw new Error(
          "Caricamento DWG scaduto. Riprovare con un file più piccolo.",
        );
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_DWG_BYTES)
        throw new Error("DWG troppo grande. Limite32MB.");
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}
