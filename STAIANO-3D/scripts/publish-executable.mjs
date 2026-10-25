import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pruneExecutablePackages } from "./prune-executable-packages.mjs";

// I segreti stanno in .env.local (escluso dal repository) quando la pubblicazione
// avviene da questa postazione; in CI arrivano dalle variabili d'ambiente.
const readEnvFile = async () => {
  try {
    const { readFile: read } = await import("node:fs/promises");
    for (const line of (await read(resolve(".env.local"), "utf8")).split(
      /\r?\n/,
    )) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]])
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    return;
  }
};
await readEnvFile();

let token = process.env.GITLAB_TOKEN;
if (!token) {
  try {
    const credentials = execFileSync("git", ["credential", "fill"], {
      input:
        "protocol=https\nhost=gitlab.com\npath=imhivanzh/Staiano3D.git\n\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GCM_INTERACTIVE: "Never",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    token = credentials
      .split(/\r?\n/)
      .find((line) => line.startsWith("password="))
      ?.slice(9);
  } catch {
    /* Authentication is reported below without exposing credentials. */
  }
}
const publisher = process.env.LICENSE_PUBLISH_TOKEN;
if (!token || !publisher)
  throw new Error(
    "Servono accesso GitLab tramite Git Credential Manager oppure GITLAB_TOKEN (api), e LICENSE_PUBLISH_TOKEN (valore del segreto PUBLISH_TOKEN del Worker), anche in .env.local.",
  );
const metadata = JSON.parse(await readFile("dist-exe/release.json", "utf8"));
if (metadata.dirty)
  throw new Error(
    "Non pubblicare pacchetti compilati da un checkout con modifiche locali.",
  );
let bytes = await readFile("dist-exe/StaianoHVAC.exe");
if (
  bytes.length !== metadata.size ||
  createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
)
  throw new Error("Il pacchetto differisce dalla build.");
const base = "https://gitlab.com/api/v4/projects/87880568";
async function request(path, init = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "PRIVATE-TOKEN": token, ...init.headers },
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
}
const tag = `exe-${metadata.commit}`;
const packagePath = `/packages/generic/staiano-hvac/${metadata.commit}/StaianoHVAC.exe`;
const packageUrl = `${base}${packagePath}`;
// Read before uploading: retries retain the immutable binary for this commit.
const artifact = await request(packagePath);
if (artifact.status === 404) {
  const upload = await request(packagePath, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`Caricamento EXE: HTTP ${upload.status}.`);
} else {
  if (!artifact.ok)
    throw new Error(
      `Lettura pacchetto già pubblicato: HTTP ${artifact.status}.`,
    );
  bytes = Buffer.from(await artifact.arrayBuffer());
  if (!bytes.length || bytes.length > 536870912)
    throw new Error("Dimensione allegato non valida.");
}
let response = await request(`/releases/${tag}`);
if (response.status === 404)
  response = await request("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      ref: metadata.commit,
      name: `Staiano HVAC ${metadata.commit.slice(0, 12)}`,
      description: `Pacchetto Windows x64. SHA-256: ${createHash("sha256").update(bytes).digest("hex")}`,
      assets: {
        links: [
          {
            name: "StaianoHVAC.exe",
            url: packageUrl,
            direct_asset_path: "/StaianoHVAC.exe",
            link_type: "package",
          },
        ],
      },
    }),
  });
if (!response.ok)
  throw new Error(`Creazione release GitLab: HTTP ${response.status}.`);
const publishedHash = createHash("sha256").update(bytes).digest("hex");
// Il Worker verifica la revisione su GitLab prima di registrare il pacchetto:
// un errore 5xx è transitorio e va ritentato, non interpretato come rifiuto.
let registered = null;
for (let attempt = 0; attempt < 5; attempt++) {
  if (attempt) await new Promise((wait) => setTimeout(wait, 2000 * attempt));
  try {
    registered = await fetch("https://licenses.ivanbuonocore.dev/publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publisher}`,
        "Content-Type": "application/json",
        "User-Agent": "Staiano-release/1",
      },
      body: JSON.stringify({
        commit: metadata.commit,
        sha256: publishedHash,
        size: bytes.length,
        url: packageUrl,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    if (attempt === 4)
      throw new Error(
        `Registrazione pacchetto sul servizio licenze non raggiungibile: ${error.message}.`,
      );
    continue;
  }
  if (registered.ok || registered.status < 500 || attempt === 4) break;
}
if (!registered?.ok) {
  const detail = await registered?.text().catch(() => "");
  throw new Error(
    `Registrazione pacchetto sul servizio licenze: HTTP ${registered?.status ?? "?"}${detail ? ` (${detail.slice(0, 200)})` : ""}.`,
  );
}
console.log(
  `Pacchetto pubblicato per ${metadata.commit}; firma e autorizzazione sono emesse dal Worker.`,
);
try {
  const removed = await pruneExecutablePackages(request, metadata.commit);
  console.log(
    `Registro EXE: conservate le ultime due versioni, rimossi ${removed} pacchetti obsoleti.`,
  );
} catch (error) {
  console.warn(
    `Pacchetto pubblicato; pulizia EXE da ripetere: ${error.message}`,
  );
}
