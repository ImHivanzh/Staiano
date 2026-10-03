import raw from "../../../catalog-data/generated/splits.json";
import history from "../../../catalog-data/generated/splits-history.json";
import { splitCatalogSchema } from "./split-schema";
export const splitCatalog = splitCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    splitCatalogSchema.parse(data),
  ]),
);
versions.set(splitCatalog.version, splitCatalog);
export function splitCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
export function splitCombinationAtVersion(id: string, version: string) {
  return (
    splitCatalogAtVersion(version)?.combinations.find((c) => c.id === id) ??
    null
  );
}
export function splitIndoorAtVersion(id: string, version: string) {
  return (
    splitCatalogAtVersion(version)?.indoorUnits.find((u) => u.id === id) ?? null
  );
}
