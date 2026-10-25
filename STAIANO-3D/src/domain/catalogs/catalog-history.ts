import {
  loadArchivedCatalog,
  readArchivedCatalog,
} from "#catalog-history-data";
import type { CatalogKind } from "./history-index";

/** Validate archived revisions only when a saved project actually requests them. */
export function catalogHistory<T extends { version: string }>(
  current: readonly T[],
  archive: Record<string, unknown> | CatalogKind,
  parse: (value: unknown) => T,
) {
  const versions = new Map(
    current.map((catalog) => [catalog.version, catalog]),
  );
  const resolve = (version: string): T | null => {
    const cached = versions.get(version);
    if (cached) return cached;
    const value =
      typeof archive === "string"
        ? readArchivedCatalog(archive, version)
        : Object.hasOwn(archive, version)
          ? archive[version]
          : null;
    if (value === null) return null;
    const catalog = parse(value);
    if (catalog.version !== version)
      throw new Error(
        `Revisione storica ${version} non coerente con il catalogo.`,
      );
    versions.set(version, catalog);
    return catalog;
  };
  return Object.assign(resolve, {
    preload: async (version: string) => {
      if (!versions.has(version) && typeof archive === "string")
        await loadArchivedCatalog(archive, version);
      return resolve(version);
    },
  });
}
