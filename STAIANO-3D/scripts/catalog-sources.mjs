// Elenca i documenti originali citati dal catalogo, verifica quali mancano e li riscarica.
// Uso: node scripts/catalog-sources.mjs <list|check|missing|fetch>
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { downloadCatalogSource } from "./catalog-download.mjs";

const GENERATED = path.join("catalog-data", "generated");
const SOURCES = path.join("catalog-data", "sources");
const MANIFEST = path.join("catalog-data", "sources-manifest.json");
const EXTENSIONS = [".pdf", ".html", ".json", ".xlsx", ".xls"];
const IGNORED = /\.(staging|previous|report)\.json$/;
const MIME = {
  "application/pdf": ".pdf",
  "text/html": ".html",
  "application/json": ".json",
  "application/xhtml+xml": ".html",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
};
const command = process.argv[2] ?? "list";

function collect(value, documents) {
  if (!value || typeof value !== "object") return documents;
  for (const [key, item] of Object.entries(value)) {
    if (key === "sourceMetadata" && item?.sha256 && item?.sourceUrl)
      documents.set(item.sha256, {
        sha256: item.sha256,
        manufacturer: item.manufacturer ?? "Non indicato",
        sourceUrl: item.sourceUrl,
        page: item.page ?? null,
      });
    collect(item, documents);
  }
  return documents;
}

async function manifestDocuments() {
  const documents = new Map();
  const names = (await readdir(GENERATED))
    .filter((name) => name.endsWith(".json") && !IGNORED.test(name))
    .sort();
  for (const name of names)
    collect(
      JSON.parse(await readFile(path.join(GENERATED, name), "utf8")),
      documents,
    );
  return [...documents.values()].sort(
    (a, b) =>
      a.manufacturer.localeCompare(b.manufacturer, "it") ||
      a.sha256.localeCompare(b.sha256),
  );
}

async function buildManifest() {
  const names = (await readdir(GENERATED)).filter(
    (name) => name.endsWith(".json") && !IGNORED.test(name),
  );
  const value = {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents: await manifestDocuments(),
  };
  const temporary = `${MANIFEST}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, MANIFEST);
  console.log(
    `${value.documents.length} documenti distinti da ${names.length} file di catalogo → ${MANIFEST}`,
  );
  const perManufacturer = value.documents.reduce(
    (all, document) =>
      all.set(document.manufacturer, (all.get(document.manufacturer) ?? 0) + 1),
    new Map(),
  );
  for (const [manufacturer, count] of [...perManufacturer].sort())
    console.log(`  ${manufacturer}: ${count}`);
  return value;
}

/** Verifica che il manifest committato corrisponda ai cataloghi generati. */
async function checkManifest() {
  const documents = await manifestDocuments();
  let committed;
  try {
    committed = JSON.parse(await readFile(MANIFEST, "utf8")).documents;
  } catch {
    committed = null;
  }
  if (JSON.stringify(committed) === JSON.stringify(documents))
    return console.log(`manifest aggiornato (${documents.length} documenti)`);
  console.log(
    `manifest non allineato ai cataloghi (attesi ${documents.length} documenti, presenti ${committed?.length ?? 0}).`,
  );
  throw new Error(
    "esegui npm run catalog:sources:list e committa catalog-data/sources-manifest.json.",
  );
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    throw new Error(
      `Manifest assente. Eseguire prima: npm run catalog:sources:list`,
    );
  }
}

/** Indice sha256 → percorso dei documenti già presenti. */
async function archived() {
  const index = new Map();
  for (const root of [SOURCES, "public"]) {
    let names;
    try {
      names = await readdir(root, { recursive: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const name of names) {
      if (!EXTENSIONS.includes(path.extname(String(name)).toLowerCase()))
        continue;
      const file = path.join(root, String(name));
      let content;
      try {
        content = await readFile(file);
      } catch {
        continue;
      }
      index.set(
        createHash("sha256").update(content).digest("hex").toLowerCase(),
        file,
      );
    }
  }
  return index;
}

function slug(value) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "documenti"
  );
}

async function download(document) {
  const url = new URL(document.sourceUrl);
  const { content, contentType } = await downloadCatalogSource(document);
  const extension = EXTENSIONS.includes(
    path.extname(url.pathname).toLowerCase(),
  )
    ? path.extname(url.pathname).toLowerCase()
    : MIME[contentType.split(";")[0].trim().toLowerCase()];
  if (!extension) throw new Error("estensione non riconosciuta");
  const stem = path
    .basename(url.pathname, path.extname(url.pathname))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);
  const target = path.join(
    SOURCES,
    slug(document.manufacturer),
    `${stem || "documento"}-${document.sha256.slice(0, 8)}${extension}`,
  );
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.scarico.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, target);
  return target;
}

async function inParallel(items, limit, run) {
  const queue = [...items];
  const results = [];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        results.push(await run(item));
      }
    }),
  );
  return results;
}

if (command === "list") {
  await buildManifest();
  process.exit(0);
}
if (command === "check") {
  await checkManifest();
  process.exit(0);
}
const manifest = await readManifest();
const present = await archived();
const missing = manifest.documents.filter(
  (document) => !present.has(document.sha256.toLowerCase()),
);
console.log(
  `Documenti attesi: ${manifest.documents.length} · archiviati: ${manifest.documents.length - missing.length} · mancanti: ${missing.length}`,
);
for (const document of missing)
  console.log(`  ${document.manufacturer}: ${document.sourceUrl}`);
if (command === "missing") {
  if (missing.length)
    console.log(
      `\nRecuperali con: npm run catalog:sources:fetch (oppure copia la cartella catalog-data\\sources dalla copia di sviluppo).`,
    );
  process.exit(0);
}
if (command !== "fetch")
  throw new Error(`Comando non riconosciuto: ${command}`);
if (!missing.length) {
  console.log("Nessun documento da scaricare.");
  process.exit(0);
}
console.log(`\nScarico ${missing.length} documenti...`);
const failures = [];
let done = 0;
await inParallel(missing, 4, async (document) => {
  try {
    await download(document);
    done += 1;
    console.log(
      `  [${done + failures.length}/${missing.length}] ok ${document.manufacturer}`,
    );
  } catch (error) {
    failures.push({ document, error: error.message });
    console.log(
      `  [${done + failures.length}/${missing.length}] non scaricato: ${document.manufacturer} — ${error.message}`,
    );
  }
});
console.log(`\nRecuperati ${done} su ${missing.length}.`);
await mkdir(".cache", { recursive: true });
await writeFile(
  path.join(".cache", "catalog-fetch-report.json"),
  `${JSON.stringify(
    {
      completedAt: new Date().toISOString(),
      expected: manifest.documents.length,
      alreadyPresent: manifest.documents.length - missing.length,
      recovered: done,
      failures,
    },
    null,
    2,
  )}\n`,
);
if (failures.length) {
  console.log(
    "Da recuperare a mano (indirizzo o contenuto non più disponibile):",
  );
  for (const failure of failures)
    console.log(
      `  ${failure.document.manufacturer}: ${failure.document.sourceUrl}`,
    );
  process.exitCode = 1;
}
