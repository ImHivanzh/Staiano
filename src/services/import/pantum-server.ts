import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let busy = false;

export class ScannerError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function scanPantum(
  dpi: 150 | 300 | 600,
  source: "piano" | "adf",
) {
  if (busy)
    throw new ScannerError(
      "Scanner occupato: attendi il termine dell’altra scansione.",
      409,
    );
  if (process.platform !== "win32")
    throw new ScannerError(
      "La scansione Pantum richiede il server Windows.",
      503,
    );
  busy = true;
  let folder: string | undefined;
  try {
    folder = await mkdtemp(path.join(tmpdir(), "staiano-pantum-"));
    const output = path.join(folder, "scansione.pdf");
    await new Promise<void>((resolve, reject) => {
      execFile(
        /* turbopackIgnore: true */
        process.env.STAIANO_SCANNER_PYTHON || "python",
        [
          path.resolve("native/pantum/scansione.py"),
          "--worker-scan",
          String(dpi),
          output,
          source,
        ],
        { windowsHide: true, timeout: 125_000, maxBuffer: 4096 },
        (error, _stdout, stderr) => {
          if (!error) return resolve();
          reject(
            new ScannerError(
              error.killed
                ? "Timeout scanner. Riprova quando la Pantum è pronta."
                : error.code === "ENOENT"
                  ? "Python scanner non disponibile. Verifica STAIANO_SCANNER_PYTHON sul server."
                  : stderr.trim().slice(0, 500) ||
                    "Acquisizione Pantum non riuscita.",
              error.killed ? 504 : error.code === "ENOENT" ? 503 : 502,
            ),
          );
        },
      );
    });
    const size = (await stat(output)).size;
    if (size <= 5 || size > 32 * 1024 * 1024)
      throw new ScannerError("PDF scanner assente o troppo grande.");
    const pdf = await readFile(output);
    if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-")
      throw new ScannerError("PDF della scansione non valido.");
    return pdf;
  } finally {
    try {
      if (folder) {
        await rm(path.join(folder, "scansione.pdf"), { force: true });
        await rmdir(folder);
      }
    } finally {
      busy = false;
    }
  }
}
