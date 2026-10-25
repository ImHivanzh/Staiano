import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { historyAssets, historyFiles, type CatalogKind } from "./history-index";

const assets = new Map<string, unknown>();
const archives = new Map<CatalogKind, Record<string, unknown>>();
export function readArchivedCatalog(
  kind: CatalogKind,
  version: string,
): unknown | null {
  const asset = Object.hasOwn(historyAssets[kind], version)
    ? historyAssets[kind][version]
    : null;
  if (asset) {
    if (assets.has(asset.sha256)) return assets.get(asset.sha256);
    let text: string | null = null;
    try {
      text = readFileSync(
        resolve(process.cwd(), "public/catalog-history", asset.file),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (text !== null) {
      if (createHash("sha256").update(text).digest("hex") !== asset.sha256)
        throw new Error(
          `Catalogo storico ${kind} ${version}: impronta non valida.`,
        );
      const value: unknown = JSON.parse(text);
      assets.set(asset.sha256, value);
      return value;
    }
  }
  // CLI/tests can use the canonical archives before generating browser assets.
  let archive = archives.get(kind);
  if (!archive) {
    try {
      archive = JSON.parse(
        readFileSync(
          resolve(process.cwd(), "catalog-data/generated", historyFiles[kind]),
          "utf8",
        ),
      ) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !asset)
        return null;
      throw new Error(`Catalogo storico ${kind} ${version} non disponibile.`, {
        cause: error,
      });
    }
    archives.set(kind, archive);
  }
  return Object.hasOwn(archive, version) ? archive[version] : null;
}
export async function loadArchivedCatalog(kind: CatalogKind, version: string) {
  return readArchivedCatalog(kind, version);
}
