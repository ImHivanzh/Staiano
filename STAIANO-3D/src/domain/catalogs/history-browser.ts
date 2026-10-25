import { historyAssets, type CatalogKind } from "./history-index";

const values = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();
function assetAt(kind: CatalogKind, version: string) {
  return Object.hasOwn(historyAssets[kind], version)
    ? historyAssets[kind][version]
    : null;
}
export function readArchivedCatalog(
  kind: CatalogKind,
  version: string,
): unknown | null {
  const asset = assetAt(kind, version);
  if (!asset) return null;
  if (!values.has(asset.sha256))
    throw new Error(
      `Caricare la revisione storica ${kind} ${version} prima di usare il progetto.`,
    );
  return values.get(asset.sha256);
}
export async function loadArchivedCatalog(kind: CatalogKind, version: string) {
  const asset = assetAt(kind, version);
  if (!asset) return null;
  if (values.has(asset.sha256)) return values.get(asset.sha256);
  let request = pending.get(asset.sha256);
  if (!request) {
    request = (async () => {
      const response = await fetch(`/catalog-history/${asset.file}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(
          `Catalogo storico ${kind} ${version} non disponibile. Riprova.`,
        );
      const bytes = await response.arrayBuffer();
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      ]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== asset.sha256)
        throw new Error(
          `Catalogo storico ${kind} ${version}: impronta non valida.`,
        );
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      values.set(asset.sha256, value);
      return value;
    })();
    pending.set(asset.sha256, request);
  }
  try {
    return await request;
  } finally {
    pending.delete(asset.sha256);
  }
}
