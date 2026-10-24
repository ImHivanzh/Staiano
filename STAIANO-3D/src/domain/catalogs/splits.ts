import raw from "../../../catalog-data/generated/splits.json" with { type: "json" };
import history from "../../../catalog-data/generated/splits-history.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import { splitCatalogSchema } from "./split-schema";
export const splitCatalog = splitCatalogSchema.parse(raw);
export const splitCatalogAtVersion = catalogHistory(
  [splitCatalog],
  history,
  splitCatalogSchema.parse,
);
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
export function splitOutdoorAtVersion(
  model: string,
  manufacturer: string,
  version: string,
) {
  return (
    splitCatalogAtVersion(version)?.outdoorUnits.find(
      (unit) => unit.model === model && unit.manufacturer === manufacturer,
    ) ?? null
  );
}
