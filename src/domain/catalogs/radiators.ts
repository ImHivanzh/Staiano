import cordivari from "../../../catalog-data/generated/cordivari.json";
import global from "../../../catalog-data/generated/global.json";
import history from "../../../catalog-data/generated/radiator-history.json";
import { radiatorCatalogSchema } from "./radiator-schema";
export const radiatorCatalogs = [
  radiatorCatalogSchema.parse(cordivari),
  radiatorCatalogSchema.parse(global),
];
export const radiatorProducts = radiatorCatalogs.flatMap((c) => c.products);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    radiatorCatalogSchema.parse(data),
  ]),
);
for (const catalog of radiatorCatalogs) versions.set(catalog.version, catalog);
export function radiatorCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
export function radiatorProductAtVersion(id: string, version: string) {
  return (
    radiatorCatalogAtVersion(version)?.products.find(
      (product) => product.id === id,
    ) ?? null
  );
}
