"use strict";
// This launcher is embedded in Node SEA. Runtime data contains production assets and bytecode only.
const fs = require("node:fs");
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

function fingerprint() {
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
  if (macs.length) parts.push(`mac:${macs[0]}`);
  return `mch_${crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32)}`;
}

function atomicJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
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
    const content = Buffer.from(encoded, "base64");
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
  process.env.STAIANO_PACKAGED = "1";
  process.env.STAIANO_CATALOG_SOURCES = path.join(
    dataRoot,
    "catalog-data",
    "sources",
  );
  process.env.HOSTNAME = "127.0.0.1";
  process.env.PORT = String(process.env.STAIANO_EXE_TEST_PORT || "3015");
  process.env.NODE_ENV = "production";
  process.env.STAIANO_RELEASE_ID = config.buildId;
  const runtimeRequire = createRequire(path.join(runtime, "server.js"));
  runtimeRequire(path.join(runtime, "server.js"));
}

async function authorization(dataRoot, config, sequence) {
  const state = JSON.parse(
    fs.readFileSync(path.join(dataRoot, ".cache", "license.json"), "utf8"),
  );
  const machineId = fingerprint();
  if (state.machineId !== machineId)
    throw new Error("Licenza appartenente a un'altra postazione.");
  const nonce = crypto.randomBytes(32).toString("hex");
  const response = await fetch(`${SERVER}/updates/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseKey: state.key, machineId, nonce }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
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

async function update(dataRoot, config) {
  const install = path.dirname(dataRoot),
    activeFile = path.join(install, "active.json");
  const current = JSON.parse(fs.readFileSync(activeFile, "utf8"));
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
      machineId: fingerprint(),
      nonce: release.nonce,
    });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  const approval = await authorization(dataRoot, config, release.sequence);
  if (!approval || approval.sha256 !== release.sha256)
    throw new Error("Il pacchetto non è più autorizzato. Riprovare.");
  // The active server keeps serving while the new package is downloaded and checked.
  const switchScript = `& { param($exe, $data)
    $ErrorActionPreference='Stop'
    schtasks /End /TN '${TASK}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Arresto del servizio non riuscito.' }
    $deadline=(Get-Date).AddSeconds(30)
    while ((Get-ScheduledTask -TaskName '${TASK}').State -ne 'Ready') { if ((Get-Date) -gt $deadline) { throw 'Attivita non arrestata.' }; Start-Sleep -Milliseconds 250 }
    $action=New-ScheduledTaskAction -Execute $exe -Argument ('--serve --data-dir "'+$data+'"') -WorkingDirectory (Split-Path $exe)
    Set-ScheduledTask -TaskName '${TASK}' -Action $action | Out-Null
    $last=(Get-ScheduledTaskInfo -TaskName '${TASK}').LastRunTime
    schtasks /Run /TN '${TASK}' | Out-Null
    Start-Sleep -Seconds 2
    if ((Get-ScheduledTaskInfo -TaskName '${TASK}').LastRunTime -le $last) { Start-ScheduledTask -TaskName '${TASK}' }
  }`;
  const switchTo = (exe) => powershell(switchScript, [exe, dataRoot]);
  try {
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
    });
    console.log(`Aggiornamento installato: ${release.commit}`);
  } catch (error) {
    switchTo(current.executable);
    throw error;
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
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
    return;
  }
  if (!args.includes("--serve"))
    throw new Error("Usare --serve oppure --update.");
  unpack(dataRoot, config);
  const record = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    buildId: config.buildId,
    buildDirectory: ".next",
    commit: config.commit,
    executable: process.execPath,
  };
  atomicJson(path.join(dataRoot, ".cache", "production-server.json"), record);
}

module.exports = { verifyManifest, safeRuntimePath, download, fingerprint };
if (sea.isSea())
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
