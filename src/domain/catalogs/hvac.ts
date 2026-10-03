import raw from "../../../catalog-data/generated/hvac.json";
import history from "../../../catalog-data/generated/hvac-history.json";
import { hvacCatalogSchema } from "./hvac-schema";
export const hvacCatalog = hvacCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    hvacCatalogSchema.parse(data),
  ]),
);
versions.set(hvacCatalog.version, hvacCatalog);
export function hvacCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
export function hvacProductAtVersion(id: string, version: string) {
  return (
    hvacCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null
  );
}
