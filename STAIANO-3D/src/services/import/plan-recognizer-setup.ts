import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Ambiente AI nella cartella dati (`.cache` è un collegamento ai dati): sopravvive agli aggiornamenti dell'EXE. */
export const recognizerHome = () => path.resolve(".cache/floorplan-ai");
export const recognizerDefaults = () => ({
  python: path.join(recognizerHome(), "venv/Scripts/python.exe"),
  source: path.join(recognizerHome(), "official"),
  checkpoint: path.join(
    recognizerHome(),
    "models/raster2seq/cubicasa5k/checkpoint.pth",
  ),
});

/**
 * Impronta del modello: URL, hash e versioni pip dello script più requirements.
 * Cambia solo se cambia il modello o una libreria, non per altre modifiche allo script.
 */
export function recipeId(script: string, requirements: string) {
  const lines = script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /https?:\/\/|\b[0-9A-F]{64}\b|pip install/i.test(line));
  return createHash("sha256")
    .update(`${lines.join("\n")}\n--\n${requirements.trim()}`)
    .digest("hex");
}

const markerFile = (home: string) => path.join(home, "installed.json");

export const markInstalled = async (home: string, recipe: string) => {
  await mkdir(home, { recursive: true });
  await writeFile(
    markerFile(home),
    JSON.stringify({ recipe, at: new Date().toISOString() }),
  );
};

/**
 * Confronta l'installazione con l'impronta attuale. Con un modello diverso
 * cancella quello vecchio ("replaced"); un'installazione completa senza
 * marcatore (fatta a mano) viene adottata, una incompleta va ripresa ("missing").
 */
export async function reconcileInstall(
  home: string,
  recipe: string,
  complete: boolean,
): Promise<"current" | "adopted" | "missing" | "replaced"> {
  const saved = await readFile(markerFile(home), "utf8")
    .then((text) => (JSON.parse(text) as { recipe?: string }).recipe ?? null)
    .catch(() => null);
  if (saved === recipe) return complete ? "current" : "missing";
  if (saved === null) {
    if (!complete) return "missing";
    await markInstalled(home, recipe);
    return "adopted";
  }
  await rm(home, { recursive: true, force: true });
  return "replaced";
}

type Setup = {
  state: "running" | "error";
  message: string;
  since: number;
  phase?: "python";
};
let setup: Setup | null = null;
export const setupState = () => setup;

// winget: «già installato, nessun aggiornamento disponibile».
const WINGET_ALREADY_INSTALLED = -1978335135;

/**
 * Installa Python 3.12 con winget, solo su richiesta esplicita dell'utente.
 * Finita l'installazione, la verifica successiva prepara da sola il riconoscitore.
 */
export function installPython312() {
  if (process.platform !== "win32")
    throw new Error("Installazione guidata disponibile solo su Windows.");
  if (setup?.state === "running") return;
  setup = {
    state: "running",
    phase: "python",
    since: Date.now(),
    message:
      "Installazione di Python 3.12 in corso con winget: servono alcuni minuti.",
  };
  let tail = "";
  const child = spawn(
    "winget",
    [
      "install",
      "-e",
      "--id",
      "Python.Python.3.12",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const collect = (chunk: Buffer) => (tail = (tail + chunk).slice(-500));
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const fail = (message: string) =>
    (setup = { state: "error", since: Date.now(), message });
  child.once("error", () =>
    fail(
      "winget non è disponibile sul server: installa Python 3.12 a mano da python.org e premi Verifica AI.",
    ),
  );
  child.once("close", (code) => {
    if (code === 0 || code === WINGET_ALREADY_INSTALLED) setup = null;
    else
      fail(
        `Installazione di Python 3.12 non riuscita (codice ${code}). ${tail.trim().split(/\r?\n/).at(-1) ?? ""}`.trim(),
      );
  });
}

async function python312(): Promise<string | null> {
  if (process.env.STAIANO_PYTHON312) return process.env.STAIANO_PYTHON312;
  return new Promise((resolve) => {
    const child = spawn(
      "py",
      ["-3.12", "-c", "import sys; print(sys.executable)"],
      { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code === 0 ? output.trim() : null));
  });
}

/**
 * Prepara da sola il riconoscitore avanzato: se manca, è incompleto o il modello
 * è cambiato, cancella il vecchio e lancia in background lo script di
 * installazione. `current` è il runtime valido oggi (o null). Un errore non
 * riparte da solo: serve una nuova verifica esplicita.
 */
export async function prepareRecognizer(
  check: boolean,
  current: { python: string } | null,
  busy: boolean,
) {
  if (process.platform !== "win32" || busy || setup?.state === "running")
    return;
  if (setup?.state === "error" && !check) return;
  const script = path.resolve("deploy/setup-plan-recognizer.ps1");
  const recipe = await Promise.all([
    readFile(script, "utf8"),
    readFile(path.resolve("native/PlanRecognizer/requirements.txt"), "utf8"),
  ])
    .then(([text, requirements]) => recipeId(text, requirements))
    .catch(() => null);
  if (!recipe) return;
  const home = recognizerHome();
  // Un ambiente indicato a mano fuori dalla cartella dati non si tocca.
  if (current && path.relative(home, current.python).startsWith("..")) return;
  const result = await reconcileInstall(home, recipe, current !== null);
  if (result === "current" || result === "adopted") return;
  const python = await python312();
  if (!python) {
    setup = {
      state: "error",
      since: Date.now(),
      message:
        "Python 3.12 non trovato sul server: installalo con «winget install -e --id Python.Python.3.12» e premi Verifica AI, la preparazione parte da sola.",
    };
    return;
  }
  setup = {
    state: "running",
    since: Date.now(),
    message: "Preparazione della ricostruzione avanzata in corso.",
  };
  let tail = "";
  const child = spawn(
    path.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32/WindowsPowerShell/v1.0/powershell.exe",
    ),
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Python",
      python,
    ],
    { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (chunk) => (tail = (tail + chunk).slice(-500)));
  const fail = (message: string) =>
    (setup = { state: "error", since: Date.now(), message });
  child.once("error", (error) => fail(error.message));
  child.once("close", (code) => {
    if (code !== 0)
      return void fail(
        tail.trim() ||
          "Preparazione della ricostruzione avanzata non riuscita.",
      );
    markInstalled(home, recipe).then(
      () => (setup = null),
      (error: Error) => fail(error.message),
    );
  });
}
