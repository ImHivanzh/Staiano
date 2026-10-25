import raw from "../../../catalog-data/generated/catalog-history-index.json" with { type: "json" };
export type CatalogKind = keyof typeof raw.files;
export type CatalogHistoryAsset = { file: string; sha256: string };
export const historyFiles = raw.files;
export const historyAssets: Record<
  CatalogKind,
  Record<string, CatalogHistoryAsset>
> = raw.catalogs;
