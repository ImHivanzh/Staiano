#!/usr/bin/env node
// Rimuove gli artefatti rigenerabili accumulati nel progetto senza toccare
// stato, segreti, licenze, fixture di test e runtime locali.
//
//   npm run pulisci            artefatti di sviluppo (log, screenshot, download,
//                              vecchi EXE, test temporanei, report)
//   npm run pulisci -- --tutto rimuove anche .next e .next-update (la build
//                              successiva sara' piu' lenta)
//   npm run pulisci -- --prova mostra solo cosa verrebbe rimosso
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, ".cache");
const dryRun = process.argv.includes("--prova");
const removeBuild = process.argv.includes("--tutto");

const dirs = [
  ".cache/build-temp",
  ".cache/codeberg-download",
  ".cache/dossier-after-pages",
  ".cache/dossier-before-pages",
  ".cache/dossier-complete-pages",
  ".cache/dossier-empty-pages",
  ".cache/dossier-summary-pages",
  ".cache/dossier-worker",
  ".cache/dotnet-temp",
  ".cache/dwg-import",
  ".cache/exe-gitlab-final",
  ".cache/exe-icon-check",
  ".cache/exe-smoke",
  ".cache/floorplan-ai/pip-cache",
  ".cache/gofile-package",
  ".cache/gitlab-download",
  ".cache/hp-images",
  ".cache/license-worker-snapshot",
  ".cache/nuget-scratch",
  ".cache/nuget-temp",
  ".cache/plan-recognition",
  ".cache/pw-base",
  ".cache/pw-mine",
  ".cache/r3f",
  ".cache/sketchup",
  ".cache/test-temp",
  ".cache/test-tmp",
  ".cache/tmp",
  ".cache/vrv-images",
  "dist-exe",
  "playwright-report",
  "test-results",
  "tmp",
];
if (removeBuild) dirs.push(".next", ".next-update");

// Stato privato: non va mai rimosso dalla pulizia.
const keepFiles = new Set([
  "app-auth.json",
  "catalog-documents.json",
  "dossier-private.pkcs8",
  "guided-ui-fixtures.json",
  "initial-user-credentials.json",
  "license.json",
  "production-server.json",
  "shared-projects.json",
]);
const keepExtensions = [".pem", ".pkcs8"];

const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

async function du(target) {
  const info = await stat(target).catch(() => null);
  if (!info) return 0;
  if (!info.isDirectory()) return info.size;
  let total = 0;
  const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) total += await du(full);
    else if (entry.isFile()) total += (await stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

let freed = 0;
let removed = 0;
let skipped = 0;

for (const rel of dirs) {
  const target = path.join(root, rel);
  const size = await du(target);
  if (!size && !(await stat(target).catch(() => null))) continue;
  if (dryRun) {
    console.log(`~ ${mb(size)} MB  ${rel}`);
    freed += size;
    continue;
  }
  try {
    await rm(target, { recursive: true, force: true });
    freed += size;
    removed += 1;
    console.log(`- ${mb(size)} MB  ${rel}`);
  } catch (error) {
    skipped += 1;
    console.warn(`! non rimosso ${rel}: ${error.message}`);
  }
}

const loose = await readdir(cache, { withFileTypes: true }).catch(() => []);
for (const entry of loose) {
  if (!entry.isFile()) continue;
  if (keepFiles.has(entry.name)) continue;
  if (keepExtensions.some((extension) => entry.name.endsWith(extension))) continue;
  const full = path.join(cache, entry.name);
  const size = (await stat(full).catch(() => ({ size: 0 }))).size;
  if (dryRun) {
    console.log(`~ ${mb(size)} MB  .cache/${entry.name}`);
    freed += size;
    continue;
  }
  try {
    await rm(full, { force: true });
    freed += size;
    removed += 1;
  } catch (error) {
    skipped += 1;
    console.warn(`! non rimosso .cache/${entry.name}: ${error.message}`);
  }
}

if (dryRun) {
  console.log(`\nProva: si libererebbero ${mb(freed)} MB.`);
} else {
  console.log(`\nLiberati ${mb(freed)} MB (${removed} elementi, ${skipped} non rimovibili).`);
}
if (!removeBuild && !dryRun) {
  console.log("Le cache di compilazione .next/.next-update sono state conservate (--tutto per rimuoverle).");
}
