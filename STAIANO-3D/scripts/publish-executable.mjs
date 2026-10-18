import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

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

let token = process.env.GITHUB_TOKEN;
if (!token) {
  try {
    const credentials = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
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
    /* GitHub authentication is reported below without exposing credentials. */
  }
}
const publisher = process.env.LICENSE_PUBLISH_TOKEN;
if (!token || !publisher)
  throw new Error(
    "Servono accesso GitHub tramite Git Credential Manager (oppure GITHUB_TOKEN con Contents:write) e LICENSE_PUBLISH_TOKEN in .env.local.",
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
const base = "https://api.github.com/repos/ImHivanzh/Staiano";
async function request(path, init = {}) {
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Staiano-release",
      Accept: "application/vnd.github+json",
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
}
const tag = `exe-${metadata.commit}`;
let response = await request(`/releases/tags/${tag}`);
if (response.status === 404)
  response = await request("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: metadata.commit,
      name: `Staiano HVAC ${metadata.commit.slice(0, 12)}`,
      body: `Pacchetto Windows x64. SHA-256: ${metadata.sha256}`,
      draft: false,
      prerelease: false,
    }),
  });
if (!response.ok)
  throw new Error(`Creazione release GitHub: HTTP ${response.status}.`);
const release = await response.json();
const assetsResponse = await request(`/releases/${release.id}/assets`);
if (!assetsResponse.ok)
  throw new Error(`Elenco allegati: HTTP ${assetsResponse.status}.`);
const assets = await assetsResponse.json();
const existing = assets.find((asset) => asset.name === "StaianoHVAC.exe");
if (!existing) {
  const uploadUrl = new URL(release.upload_url.split("{")[0]);
  if (
    uploadUrl.origin !== "https://uploads.github.com" ||
    !uploadUrl.pathname.startsWith("/repos/ImHivanzh/Staiano/releases/")
  )
    throw new Error("Destinazione upload GitHub non valida.");
  uploadUrl.searchParams.set("name", "StaianoHVAC.exe");
  const upload = await fetch(uploadUrl, {
    method: "POST",
    body: bytes,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "User-Agent": "Staiano-release",
    },
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
  if (!upload.ok) throw new Error(`Caricamento EXE: HTTP ${upload.status}.`);
} else {
  // A retry reuses the immutable published binary, even if the local rebuild differs.
  let url = `https://github.com/ImHivanzh/Staiano/releases/download/${tag}/StaianoHVAC.exe`;
  let downloaded = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const target = new URL(url);
    if (
      target.protocol !== "https:" ||
      ![
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
      ].includes(target.hostname)
    )
      throw new Error("Destinazione allegato non consentita.");
    const artifact = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(300000),
    });
    if ([301, 302, 303, 307, 308].includes(artifact.status)) {
      const location = artifact.headers.get("Location");
      await artifact.body?.cancel();
      if (!location) break;
      url = new URL(location, url).href;
      continue;
    }
    if (!artifact.ok)
      throw new Error(
        `Lettura pacchetto già pubblicato: HTTP ${artifact.status}.`,
      );
    bytes = Buffer.from(await artifact.arrayBuffer());
    if (
      bytes.length !== existing.size ||
      bytes.length > 536870912 ||
      (existing.digest &&
        existing.digest !==
          `sha256:${createHash("sha256").update(bytes).digest("hex")}`)
    )
      throw new Error("Pacchetto pubblicato non verificato.");
    downloaded = true;
    break;
  }
  if (!downloaded) throw new Error("Pacchetto esistente non verificato.");
}
const publishedHash = createHash("sha256").update(bytes).digest("hex");
response = await fetch("https://licenses.ivanbuonocore.dev/publish", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${publisher}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    commit: metadata.commit,
    sha256: publishedHash,
    size: bytes.length,
    url: `https://github.com/ImHivanzh/Staiano/releases/download/${tag}/StaianoHVAC.exe`,
  }),
  redirect: "error",
  signal: AbortSignal.timeout(30000),
});
if (!response.ok)
  throw new Error(
    `Registrazione pacchetto sul servizio licenze: HTTP ${response.status}.`,
  );
console.log(
  `Pacchetto pubblicato per ${metadata.commit}; firma e autorizzazione sono emesse dal Worker.`,
);
