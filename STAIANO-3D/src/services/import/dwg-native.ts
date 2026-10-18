import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const nativeInfoSchema = z.object({
  parser: z.literal("ACadSharp 3.8.0"),
  license: z.literal("MIT"),
  originalVersion: z.string().regex(/^AC10\d\d$/),
  entities: z.number().int().nonnegative().max(50000),
  warnings: z.array(z.string().max(300)).max(100),
});

/** Only administrator-provided executable paths or known local runtime locations. */
export async function nativeDwgRuntime() {
  const assembly = path.resolve(process.cwd(), "native/runtime/DwgBridge.dll");
  if (!(await stat(assembly).catch(() => null))?.isFile()) return null;
  const configured = process.env.DOTNET_EXECUTABLE_PATH;
  const candidates = configured
    ? [configured]
    : process.platform === "win32"
      ? [
          path.join(
            process.env.ProgramFiles ?? "C:\\Program Files",
            "dotnet/dotnet.exe",
          ),
        ]
      : ["/usr/bin/dotnet", "/usr/share/dotnet/dotnet"];
  for (const executable of candidates) {
    if (
      !path.isAbsolute(executable) ||
      !/^dotnet(?:\.exe)?$/i.test(path.basename(executable))
    )
      continue;
    if ((await stat(executable).catch(() => null))?.isFile())
      return { executable, assembly };
  }
  return null;
}

export async function executeNativeDwg(input: string, output: string) {
  const runtime = await nativeDwgRuntime();
  if (!runtime)
    throw new Error(
      "Lettore DWG locale non disponibile. Compilare il bridge o esportare DXF ASCII dal CAD.",
    );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(runtime.executable, [runtime.assembly, input, output], {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        DOTNET_CLI_TELEMETRY_OPTOUT: "1",
        DOTNET_GENERATE_ASPNET_CERTIFICATE: "false",
        DOTNET_GCHeapHardLimit: "0x20000000",
      },
    });
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      child.kill();
    }, 30000);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(
        new Error(
          "Avvio lettore DWG non riuscito. Verificare il runtime .NET locale.",
        ),
      );
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (expired)
        reject(
          new Error(
            "DWG troppo complesso. Esportare un DXF 2D semplificato dal CAD.",
          ),
        );
      else if (code !== 0)
        reject(
          new Error(
            "DWG non leggibile, danneggiato o non supportato dal lettore locale. Esportare DXF ASCII dal CAD.",
          ),
        );
      else resolve();
    });
  });
  const metadata = JSON.parse(
    await readFile(output + ".info.json", "utf8"),
  ) as unknown;
  const result = nativeInfoSchema.parse(metadata);
  return { ...result, warnings: [...new Set(result.warnings)] };
}
