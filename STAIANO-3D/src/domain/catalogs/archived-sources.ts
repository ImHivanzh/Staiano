import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const digests = new Map<string, string>();

export const sha256File = (file: string) => {
  let digest = digests.get(file);
  if (!digest) {
    digest = createHash("sha256").update(readFileSync(file)).digest("hex");
    digests.set(file, digest);
  }
  return digest;
};

let files: string[] | null = null;
const archivedFiles = () =>
  (files ??= ["catalog-data/sources", "public"].flatMap((root) => {
    try {
      return readdirSync(root, { recursive: true, encoding: "utf8" }).map(
        (entry) => join(root, entry),
      );
    } catch {
      return [];
    }
  }));

/**
 * Documento tecnico archiviato, cercato per SHA-256 invece che per nome: il file può
 * stare nel percorso storico oppure con suffisso hash, come lo scrive
 * `npm run catalog:sources:fetch`. `null` se questa postazione non lo ha.
 */
export function archivedDocument(sha256: string, legacyPath: string) {
  if (existsSync(legacyPath)) return legacyPath;
  const suffix = sha256.slice(0, 8);
  for (const file of archivedFiles()) {
    if (!basename(file).includes(suffix)) continue;
    try {
      if (sha256File(file) === sha256.toLowerCase()) return file;
    } catch {
      // voce che non è un file leggibile: si prosegue
    }
  }
  return null;
}

/**
 * `catalog-data/sources` sta fuori da Git: su una postazione nuova i documenti vanno
 * riportati con `npm run catalog:sources:fetch`, e quelli che il produttore non
 * pubblica più non sono verificabili da nessuna parte.
 */
export function reportUnarchived(documents: string[]) {
  if (!documents.length) return;
  console.warn(
    `[cataloghi] documenti citati non archiviati in locale, hash non verificato: ${documents.join(", ")}. ` +
      "Vedi `npm run catalog:sources:missing`.",
  );
}
