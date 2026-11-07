"use strict";
// This launcher is embedded in Node SEA. Runtime data contains production assets and bytecode only.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { gunzipSync } = require("node:zlib");
const sea = require("node:sea");
const SERVER = "https://licenses.ivanbuonocore.dev";
const TASK = "Staiano HVAC";

function verifyManifest(
  token,
  publicKey,
  machineId,
  nonce,
  minimumSequence = 0,
  now = Date.now(),
) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (
    parts.length !== 2 ||
    !crypto.verify(
      null,
      Buffer.from(`staiano-update-v1.${parts[0]}`),
      publicKey,
      Buffer.from(parts[1], "base64url"),
    )
  )
    throw new Error("Firma aggiornamento non valida.");
  const value = JSON.parse(Buffer.from(parts[0], "base64url"));
  if (
    value.v !== 1 ||
    value.app !== "staiano-hvac" ||
    value.platform !== "win32-x64" ||
    value.machineId !== machineId ||
    value.nonce !== nonce ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < minimumSequence ||
    !/^[a-f0-9]{40}$/.test(value.commit) ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > 536870912 ||
    !Number.isSafeInteger(value.issuedAt) ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.issuedAt > now / 1000 + 30 ||
    value.expiresAt <= now / 1000 ||
    value.expiresAt - value.issuedAt > 300 ||
    value.url !== `${SERVER}/updates/download`
  )
    throw new Error(
      "Autorizzazione aggiornamento non valida, scaduta o precedente alla versione installata.",
    );
  return value;
}

function fingerprint(preferred) {
  const guid = execFileSync(
    "reg.exe",
    ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
    { encoding: "utf8", windowsHide: true },
  ).match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/)?.[1];
  if (!guid) throw new Error("Identità Windows non disponibile.");
  const parts = [
    `platform:${os.platform()}`,
    `host:${os.hostname()}`,
    `id:${guid}`,
  ];
  const macs = Object.values(os.networkInterfaces())
    .flatMap((x) => x || [])
    .filter(
      (x) =>
        !x.internal &&
        x.mac &&
        x.mac !== "00:00:00:00:00:00" &&
        !x.mac.startsWith("00:00:00"),
    )
    .map((x) => x.mac)
    .sort();
  const candidates = macs.length ? [...new Set(macs)].map((mac) => [...parts, `mac:${mac}`]) : [parts];
  const fingerprints = candidates.map((components) => `mch_${crypto.createHash("sha256").update(components.join("|")).digest("hex").slice(0, 32)}`);
  return fingerprints.includes(preferred) ? preferred : fingerprints[0];
}

function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

/** Conserva la versione attiva, quella in esecuzione e il rollback dichiarato. */
function pruneVersions(install, keepSha) {
  const root = path.join(install, "versions"),
    running = path.basename(path.dirname(process.execPath));
  let names = [];
  let previous;
  try { previous = JSON.parse(fs.readFileSync(path.join(install, "active.json"), "utf8")).previousSha256; } catch { /* Prima installazione. */ }
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === keepSha || name === running || name === previous) continue;
    try {
      fs.rmSync(path.join(root, name), {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    } catch {
      // Cartella ancora in uso: verra ritentata al prossimo avvio.
    }
  }
}

function safeRuntimePath(root, name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.includes("\\") ||
    name.includes(":") ||
    name.startsWith("/") ||
    name.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("Percorso del pacchetto non valido.");
  return path.join(root, ...name.split("/"));
}

const CATALOG_EXTENSIONS = [".pdf", ".html", ".json", ".xlsx", ".xls"];
const CATALOG_MANIFEST = "sources-manifest.json";

/** Scansione unica: conteggio per estensione e impronta della cartella. */
function catalogScan(root) {
  const found = { total: 0, byExtension: {}, bytes: 0, newest: 0 };
  let names;
  try {
    names = fs.readdirSync(root, { recursive: true });
  } catch {
    return found;
  }
  for (const name of names) {
    const extension = path.extname(String(name)).toLowerCase();
    if (!CATALOG_EXTENSIONS.includes(extension)) continue;
    let stat;
    try {
      stat = fs.statSync(path.join(root, String(name)));
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    found.total += 1;
    found.byExtension[extension] = (found.byExtension[extension] || 0) + 1;
    found.bytes += stat.size;
    found.newest = Math.max(found.newest, stat.mtimeMs);
  }
  return found;
}

/** Documents the catalog can cite, wherever they sit under the sources folder. */
function catalogDocuments(root) {
  const { total, byExtension } = catalogScan(root);
  return { total, byExtension };
}

/** Documenti citati dal catalogo, elencati nel manifest versionato. */
function catalogManifest(dataRoot) {
  try {
    const value = JSON.parse(
      fs.readFileSync(
        path.join(dataRoot, "catalog-data", CATALOG_MANIFEST),
        "utf8",
      ),
    );
    return Array.isArray(value.documents)
      ? value.documents.filter((item) => item && item.sha256 && item.sourceUrl)
      : [];
  } catch {
    return [];
  }
}

/** Numero di documenti che il catalogo cita. */
function catalogExpected(dataRoot) {
  return catalogManifest(dataRoot).length;
}

/** Documenti del manifest che non sono presenti nella cartella, per SHA-256. */
async function catalogMissing(directory, manifest) {
  const present = new Set();
  let names = [];
  try {
    names = await fsp.readdir(directory, { recursive: true });
  } catch {
    return [...manifest];
  }
  for (const name of names) {
    if (!CATALOG_EXTENSIONS.includes(path.extname(String(name)).toLowerCase()))
      continue;
    let content;
    try {
      content = await fsp.readFile(path.join(directory, String(name)));
    } catch {
      continue;
    }
    present.add(
      crypto.createHash("sha256").update(content).digest("hex").toLowerCase(),
    );
  }
  return manifest.filter(
    (document) => !present.has(document.sha256.toLowerCase()),
  );
}

function catalogStatus(dataRoot) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(dataRoot, ".cache", "catalog-documents.json"),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

function catalogInstructions(dataRoot, report) {
  const { scan, manifest, missing, sourceHint, checkedAt } = report;
  const directory = path.join(dataRoot, "catalog-data", "sources");
  const manifestFile = path.join(dataRoot, "catalog-data", CATALOG_MANIFEST);
  const origin =
    sourceHint || "<PERCORSO DELLA COPIA DI SVILUPPO>\\catalog-data\\sources";
  const copy = `robocopy "${origin}" "${directory}" *.pdf *.html *.json *.xlsx *.xls /S /NFL /NDL /NJH /NJS /NP`;
  const verify = [
    `$attesi = (Get-Content "${manifestFile}" -Raw | ConvertFrom-Json).documents`,
    `$presenti = Get-ChildItem "${directory}" -Recurse -File | Where-Object { $_.Extension -in '.pdf','.html','.json','.xlsx','.xls' } | Get-FileHash -Algorithm SHA256 | ForEach-Object { $_.Hash.ToLower() }`,
    `$attesi | Where-Object { $_.sha256 -notin $presenti } | Select-Object manufacturer, sourceUrl, sha256`,
  ];
  const shown = missing.slice(0, 60);
  return [
    "DOCUMENTI TECNICI MANCANTI — ISTRUZIONI PER RIPRISTINARLI",
    "=========================================================",
    "",
    "Stato: la cartella dei documenti originali è incompleta.",
    `        Cartella attesa:   ${directory}`,
    `        File presenti:     ${scan.total}`,
    `        Documenti attesi:  ${manifest.length || "?"}${missing.length ? ` (mancanti: ${missing.length})` : ""}`,
    `        Elenco esatto:     ${manifestFile}`,
    `        Controllo del:     ${checkedAt}`,
    "",
    ...(shown.length
      ? [
          `Documenti mancanti (${missing.length}${missing.length > shown.length ? `, primi ${shown.length} elencati` : ""})`,
          "-".repeat(20),
          ...shown.map(
            (document) =>
              `  ${document.manufacturer}: ${document.sourceUrl}  [${document.sha256.slice(0, 8)}]`,
          ),
          "",
        ]
      : []),
    "Cosa manca, in pratica",
    "----------------------",
    "Il programma funziona regolarmente: si progettano e si calcolano gli impianti.",
    "Manca solo l'archiviazione delle schede tecniche: scaricando le schede di un",
    "progetto, l'archivio esce senza i PDF originali e l'indice elenca i documenti",
    'mancanti sotto "DOCUMENTI NON DISPONIBILI", con la fonte di ciascuno.',
    "",
    "Cosa copiare",
    "------------",
    "I documenti originali dei produttori citati dal catalogo: PDF, pagine HTML,",
    "listini XLSX/XLS. Devono restare identici all'originale: il programma li",
    "riconosce dal loro SHA-256 e scarta quelli modificati. Le sottocartelle non",
    "contano, l'archivio li cerca per contenuto in tutta la cartella.",
    "",
    "Elenco esatto dei documenti attesi",
    "----------------------------------",
    `Il file ${manifestFile} elenca ogni documento citato dal catalogo`,
    "con produttore, indirizzo di origine (sourceUrl) e SHA-256 atteso: è la",
    "ricetta completa e verificabile di questa cartella.",
    "",
    "Procedura esatta",
    "----------------",
    "1) Con la copia di sviluppo del progetto a disposizione, da PowerShell:",
    "",
    `   ${copy}`,
    "",
    `   <ORIGINE> attuale: ${sourceHint || "non indicata"}`,
    "",
    "2) Senza la copia di sviluppo, i documenti si riscaricano dagli indirizzi",
    "   del manifest. Nella copia di sviluppo del progetto:",
    "",
    "      npm run catalog:sources:missing     elenca i documenti assenti",
    "      npm run catalog:sources:fetch       li scarica e verifica lo SHA-256",
    "",
    "   In alternativa, apri un progetto nell'app e scarica le schede tecniche:",
    "   INDICE-schede-tecniche.txt nell'archivio riporta, per ogni documento",
    "   mancante, la Fonte (URL) e lo SHA-256 atteso.",
    "",
    "Verifica",
    "--------",
    "Questo comando confronta i documenti presenti con l'elenco atteso e mostra",
    "solo quelli che mancano (nessuna riga = cartella completa):",
    "",
    ...verify.map((line) => `   ${line}`),
    "",
    "Al primo avvio successivo il programma riconosce i documenti completi e",
    "cancella questo file.",
    "",
    "Note",
    "----",
    "- Gli aggiornamenti del programma non toccano questa cartella: i documenti",
    "  restano al loro posto. Non copiarli sotto versions\\, che è dei pacchetti.",
    "- Non serve copiare tutto: bastano i documenti dei modelli usati; il file",
    "  resta finché la cartella non risulta completa.",
    "- Per rendere l'origine permanente, aggiungi a",
    `  ${path.join(dataRoot, ".env.local")} la riga:`,
    "      STAIANO_CATALOG_SOURCE=<percorso origine>",
    "",
  ].join("\r\n");
}

/** Scrive (o cancella) le istruzioni e lo stato della cartella documenti. */
function catalogReport(dataRoot, report) {
  const instructions = path.join(
    dataRoot,
    "catalog-data",
    "ISTRUZIONI-DOCUMENTI.txt",
  );
  const incomplete = report.missing.length > 0 || report.scan.total === 0;
  if (incomplete) {
    fs.mkdirSync(path.dirname(instructions), { recursive: true });
    fs.writeFileSync(
      instructions,
      catalogInstructions(dataRoot, report),
      "utf8",
    );
    console.warn(
      report.missing.length
        ? `Documenti tecnici incompleti: mancano ${report.missing.length} dei ${report.manifest.length} citati dal catalogo. Istruzioni per recuperarli: ${instructions}`
        : `Documenti tecnici assenti: la cartella ${path.join(dataRoot, "catalog-data", "sources")} è vuota. Istruzioni per ricrearli: ${instructions}`,
    );
  } else if (fs.existsSync(instructions)) {
    fs.unlinkSync(instructions);
    console.log(
      "Documenti tecnici completi: cartella dei documenti verificata.",
    );
  }
  fs.mkdirSync(path.join(dataRoot, ".cache"), { recursive: true });
  atomicJson(path.join(dataRoot, ".cache", "catalog-documents.json"), {
    directory: path.join(dataRoot, "catalog-data", "sources"),
    documents: report.scan.total,
    expected: report.manifest.length,
    missing: report.missing,
    byExtension: report.scan.byExtension,
    sourceHint: report.sourceHint || null,
    instructions: incomplete ? instructions : null,
    fingerprint: report.fingerprint,
    checkedAt: report.checkedAt,
  });
}

function catalogState(dataRoot) {
  const directory = path.join(dataRoot, "catalog-data", "sources");
  const manifest = catalogManifest(dataRoot);
  const scan = catalogScan(directory);
  return {
    directory,
    manifest,
    scan,
    sourceHint: process.env.STAIANO_CATALOG_SOURCE || "",
    checkedAt: new Date().toISOString(),
    fingerprint: `sha256-casefold-v2:${scan.total}:${scan.bytes}:${Math.round(scan.newest)}`,
  };
}

/** Verifica esatta, per SHA-256, dei documenti citati dal catalogo. */
async function verifyCatalogDocuments(dataRoot) {
  const state = catalogState(dataRoot);
  const missing = await catalogMissing(state.directory, state.manifest);
  catalogReport(dataRoot, { ...state, missing });
  return {
    total: state.scan.total,
    byExtension: state.scan.byExtension,
    missing,
  };
}

/**
 * Avvisa con istruzioni esatte se i documenti tecnici mancano. Il controllo
 * esatto (SHA-256 di ogni file) avviene solo quando la cartella cambia e non
 * ritarda l'avvio del server.
 */
function ensureCatalogDocuments(dataRoot) {
  const state = catalogState(dataRoot);
  const found = {
    total: state.scan.total,
    byExtension: state.scan.byExtension,
  };
  if (state.scan.total === 0) {
    catalogReport(dataRoot, { ...state, missing: state.manifest });
    return found;
  }
  const cached = catalogStatus(dataRoot);
  if (
    cached &&
    cached.fingerprint === state.fingerprint &&
    cached.expected === state.manifest.length &&
    Array.isArray(cached.missing)
  ) {
    catalogReport(dataRoot, { ...state, missing: cached.missing });
    return found;
  }
  verifyCatalogDocuments(dataRoot).catch((error) =>
    console.error(
      `Verifica dei documenti tecnici non riuscita: ${error.message}`,
    ),
  );
  return found;
}

function unpack(dataRoot, config) {
  const runtime = path.join(path.dirname(process.execPath), "runtime");
  const archive = JSON.parse(
    gunzipSync(Buffer.from(sea.getAsset("runtime")), {
      maxOutputLength: 1073741824,
    }),
  );
  fs.mkdirSync(runtime, { recursive: true });
  for (const [name, encoded] of archive) {
    const target = safeRuntimePath(runtime, name);
    const content = gunzipSync(Buffer.from(encoded, "base64"));
    const existing = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (
      !existing ||
      !crypto.timingSafeEqual(
        crypto.createHash("sha256").update(existing).digest(),
        crypto.createHash("sha256").update(content).digest(),
      )
    ) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  const cache = path.join(runtime, ".cache");
  if (!fs.existsSync(cache))
    fs.symlinkSync(path.join(dataRoot, ".cache"), cache, "junction");
  process.chdir(runtime);
  process.loadEnvFile(path.join(dataRoot, ".env.local"));
  process.env.LICENSE_SERVER_URL = SERVER;
  process.env.LICENSE_ENFORCE = "1";
  process.env.LICENSE_PUBLIC_KEY = config.publicKey;
  process.env.LICENSE_FILE = path.join(dataRoot, ".cache", "license.json");
  process.env.AUTH_FILE = path.join(dataRoot, ".cache", "app-auth.json");
  process.env.HOST_REQUEST_FILE = path.join(
    dataRoot,
    ".cache",
    "host-request.json",
  );
  process.env.STAIANO_PACKAGED = "1";
  process.env.STAIANO_CATALOG_SOURCES = path.join(
    dataRoot,
    "catalog-data",
    "sources",
  );
  ensureCatalogDocuments(dataRoot);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.PORT = String(process.env.STAIANO_EXE_TEST_PORT || "3015");
  process.env.NODE_ENV = "production";
  process.env.STAIANO_RELEASE_ID = config.buildId;
  process.env.LICENSE_APP_VERSION = config.commit;
  const runtimeRequire = createRequire(path.join(runtime, "server.js"));
  runtimeRequire(path.join(runtime, "server.js"));
}

async function authorization(dataRoot, config, sequence, versionOnly = false) {
  const state = versionOnly
    ? null
    : JSON.parse(
        fs.readFileSync(path.join(dataRoot, ".cache", "license.json"), "utf8"),
      );
  const machineId = fingerprint(state?.machineId);
  if (state && state.machineId !== machineId)
    throw new Error("Licenza appartenente a un'altra postazione.");
  const nonce = crypto.randomBytes(32).toString("hex");
  const response = await fetch(
    `${SERVER}/updates/${versionOnly ? "version" : "check"}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(state ? { licenseKey: state.key } : {}),
        machineId,
        nonce,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Aggiornamento non autorizzato o server indisponibile (${response.status}).`,
    );
  const body = await response.json();
  if (body.status === "current" && body.release === null) return null;
  return verifyManifest(
    body.manifest,
    config.publicKey,
    machineId,
    nonce,
    sequence,
  );
}

async function requireCurrentVersion(dataRoot, config) {
  const release = await authorization(dataRoot, config, 0, true);
  if (!release || release.commit !== config.commit)
    throw new Error(
      "Aggiornamento obbligatorio: questa versione non è l'ultima pubblicata. Eseguire l'aggiornamento della postazione prima di avviare Staiano HVAC.",
    );
}

async function download(release, file, credentials) {
  const response = await fetch(release.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credentials, sequence: release.sequence }),
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok || !response.body)
    throw new Error("Download del pacchetto non riuscito.");
  const handle = fs.openSync(file, "wx");
  const hash = crypto.createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > release.size)
        throw new Error("Dimensione del pacchetto non valida.");
      hash.update(chunk);
      let written = 0;
      while (written < chunk.length)
        written += fs.writeSync(handle, chunk, written, chunk.length - written);
    }
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  if (size !== release.size || hash.digest("hex") !== release.sha256)
    throw new Error(
      "Pacchetto alterato o incompleto. Installazione annullata.",
    );
}

function powershell(script, args = []) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script, ...args],
    { encoding: "utf8", windowsHide: true, timeout: 90000 },
  );
}

function runHostAction(action) {
  if (action === "anydesk")
    powershell("Restart-Service -Name AnyDesk -Force -ErrorAction Stop");
  else
    execFileSync(
      "shutdown.exe",
      ["/r", "/t", "30", "/c", "Riavvio richiesto dal pannello Staiano HVAC"],
      { windowsHide: true, timeout: 30000 },
    );
}

// Richiesta scritta dal pannello admin (src/server/host-maintenance.ts); l'app
// ha permessi limitati, questo processo (task Update) è elevato.
// shortcut: AnyDesk riavviato solo se installato come servizio Windows «AnyDesk»; il riavvio può interrompere un altro aggiornamento in corso.
function hostRequest(dataRoot, run = runHostAction) {
  const file = path.join(dataRoot, ".cache", "host-request.json");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  fs.rmSync(file, { force: true });
  const result = { at: new Date().toISOString() };
  try {
    const request = JSON.parse(raw);
    result.action = request.action;
    if (
      !["anydesk", "reboot"].includes(request.action) ||
      !(Date.now() - Date.parse(request.requestedAt) < 15 * 60 * 1000)
    )
      throw new Error("Richiesta scaduta o non valida.");
    run(request.action);
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.error = error.message;
  }
  atomicJson(path.join(dataRoot, ".cache", "host-request-result.json"), result);
  return result;
}

async function update(dataRoot, config) {
  const install = path.dirname(dataRoot),
    activeFile = path.join(install, "active.json");
  const current = JSON.parse(fs.readFileSync(activeFile, "utf8"));
  pruneVersions(install, current.sha256);
  const release = await authorization(dataRoot, config, current.sequence || 0);
  if (!release || release.commit === current.commit) {
    console.log("Nessun aggiornamento disponibile.");
    return;
  }
  if (release.sequence <= (current.sequence || 0))
    throw new Error("Rifiutato aggiornamento precedente.");
  const directory = path.join(install, "versions", release.sha256);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `download-${process.pid}.tmp`),
    target = path.join(directory, "StaianoHVAC.exe");
  try {
    const state = JSON.parse(
      fs.readFileSync(path.join(dataRoot, ".cache", "license.json"), "utf8"),
    );
    await download(release, temporary, {
      licenseKey: state.key,
      machineId: release.machineId,
      nonce: release.nonce,
    });
    const approval = await authorization(dataRoot, config, release.sequence);
    if (!approval || approval.sha256 !== release.sha256)
      throw new Error("Il pacchetto non è più autorizzato. Riprovare.");
    // The active server keeps serving while the new package is downloaded and checked.
    const stopScript = `& {
    $ErrorActionPreference='Stop'
    schtasks /End /TN '${TASK}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Arresto del servizio non riuscito.' }
    $deadline=(Get-Date).AddSeconds(30)
    while ((Get-ScheduledTask -TaskName '${TASK}').State -ne 'Ready') { if ((Get-Date) -gt $deadline) { throw 'Attivita non arrestata.' }; Start-Sleep -Milliseconds 250 }
  }`;
    const stopService = () => powershell(stopScript);
    const switchScript = `& { param($exe, $data)
    $ErrorActionPreference='Stop'
    schtasks /End /TN '${TASK}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Arresto del servizio non riuscito.' }
    $deadline=(Get-Date).AddSeconds(30)
    while ((Get-ScheduledTask -TaskName '${TASK}').State -ne 'Ready') { if ((Get-Date) -gt $deadline) { throw 'Attivita non arrestata.' }; Start-Sleep -Milliseconds 250 }
    $action=New-ScheduledTaskAction -Execute $exe -Argument ('--serve --data-dir "'+$data+'"') -WorkingDirectory (Split-Path $exe)
    Set-ScheduledTask -TaskName '${TASK}' -Action $action | Out-Null
    try { Set-ScheduledTask -TaskName '${TASK} Update' -Action (New-ScheduledTaskAction -Execute $exe -Argument ('--update --data-dir "'+$data+'"') -WorkingDirectory (Split-Path $exe)) | Out-Null } catch { }
    $last=(Get-ScheduledTaskInfo -TaskName '${TASK}').LastRunTime
    schtasks /Run /TN '${TASK}' | Out-Null
    Start-Sleep -Seconds 2
    if ((Get-ScheduledTaskInfo -TaskName '${TASK}').LastRunTime -le $last) { Start-ScheduledTask -TaskName '${TASK}' }
  }`;
  const switchTo = (exe) => powershell(switchScript, [exe, dataRoot]);
    try {
      stopService();
      fs.renameSync(temporary, target);
      switchTo(target);
      let healthy = false;
      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const response = await fetch("http://127.0.0.1:3015/accedi", {
            signal: AbortSignal.timeout(2000),
            redirect: "manual",
          });
          const processInfo = JSON.parse(
            fs.readFileSync(
              path.join(dataRoot, ".cache", "production-server.json"),
              "utf8",
            ),
          );
          if (
            response.status === 200 &&
            response.headers.get("x-staiano-build") === processInfo.buildId &&
            processInfo.commit === release.commit &&
            processInfo.executable === target &&
            (await response.text()).includes("Staiano")
          ) {
            healthy = true;
            break;
          }
        } catch {
          /* New process is still starting. */
        }
      }
      if (!healthy)
        throw new Error(
          "Nuovo EXE non risponde. Ripristino della versione precedente.",
        );
      atomicJson(activeFile, {
        executable: target,
        sequence: release.sequence,
        commit: release.commit,
        sha256: release.sha256,
        previousSha256: current.sha256,
      });
      console.log(`Aggiornamento installato: ${release.commit}`);
    } catch (error) {
      switchTo(current.executable);
      throw error;
    }
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Richiesto Windows a 64 bit.");
  const args = process.argv.slice(2),
    dataOption = args.indexOf("--data-dir");
  if (dataOption < 0 || !path.isAbsolute(args[dataOption + 1] || ""))
    throw new Error("Indicare --data-dir con un percorso assoluto.");
  const dataRoot = path.resolve(args[dataOption + 1]);
  const config = JSON.parse(sea.getAsset("config", "utf8"));
  if (args.includes("--version")) {
    console.log(config.buildId);
    return;
  }
  if (args.includes("--check-update") || args.includes("--update")) {
    const lock = path.join(dataRoot, ".cache", "update.lock");
    let fd;
    try {
      fd = fs.openSync(lock, "wx");
    } catch {
      throw new Error(
        "Controllo aggiornamenti già in corso. Verificare update.lock se il precedente processo è terminato.",
      );
    }
    try {
      if (args.includes("--check-update"))
        console.log(JSON.stringify(await authorization(dataRoot, config, 0)));
      else await update(dataRoot, config);
    } finally {
      try {
        fs.closeSync(fd);
      } finally {
        fs.unlinkSync(lock);
        // Dopo l'aggiornamento, così un riavvio non lo interrompe a metà.
        if (args.includes("--update")) hostRequest(dataRoot);
      }
    }
    return;
  }
  if (!args.includes("--serve"))
    throw new Error("Usare --serve oppure --update.");
  await requireCurrentVersion(dataRoot, config);
  try {
    const active = JSON.parse(
      fs.readFileSync(path.join(path.dirname(dataRoot), "active.json"), "utf8"),
    );
    if (active.sha256) pruneVersions(path.dirname(dataRoot), active.sha256);
  } catch {
    // Installazione senza active.json (copia di sviluppo): nulla da pulire.
  }
  unpack(dataRoot, config);
  const record = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    buildId: config.buildId,
    buildDirectory: ".next",
    commit: config.commit,
    executable: process.execPath,
  };
  if (
    !process.env.STAIANO_EXE_TEST_PORT ||
    process.env.STAIANO_EXE_TEST_PORT === "3015"
  )
    atomicJson(path.join(dataRoot, ".cache", "production-server.json"), record);
}

module.exports = {
  verifyManifest,
  safeRuntimePath,
  download,
  fingerprint,
  pruneVersions,
  catalogDocuments,
  catalogExpected,
  verifyCatalogDocuments,
  ensureCatalogDocuments,
  requireCurrentVersion,
  hostRequest,
};
if (sea.isSea())
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
