import raw from "../../../catalog-data/generated/ecoclima.json" with { type: "json" };
import history from "../../../catalog-data/generated/ecoclima-history.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import {
  airTerminalCatalogSchema,
  type AirTerminalFamily,
} from "./air-terminal-schema";

export function airTerminalMountings(family: AirTerminalFamily) {
  return family.isLinearPerMeter
    ? (["ceiling", "wall"] as const)
    : family.mountings;
}
export const airTerminalCatalog = airTerminalCatalogSchema.parse(raw);
export const airTerminalCatalogAtVersion = catalogHistory(
  [airTerminalCatalog],
  history,
  airTerminalCatalogSchema.parse,
);
export function airTerminalFamilyAtVersion(code: string, version: string) {
  return (
    airTerminalCatalogAtVersion(version)?.families.find(
      (family) => family.familyCode === code,
    ) ?? null
  );
}
