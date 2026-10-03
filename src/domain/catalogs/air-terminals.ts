import raw from "../../../catalog-data/generated/ecoclima.json";
import history from "../../../catalog-data/generated/ecoclima-history.json";
import { airTerminalCatalogSchema } from "./air-terminal-schema";
export const airTerminalCatalog = airTerminalCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    airTerminalCatalogSchema.parse(data),
  ]),
);
versions.set(airTerminalCatalog.version, airTerminalCatalog);
export function airTerminalCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
export function airTerminalFamilyAtVersion(code: string, version: string) {
  return (
    airTerminalCatalogAtVersion(version)?.families.find(
      (family) => family.familyCode === code,
    ) ?? null
  );
}
