import raw from "../../../catalog-data/generated/heat-pumps.json" with { type: "json" };
import history from "../../../catalog-data/generated/heat-pumps-history.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import {
  heatPumpCatalogSchema,
  type HeatPumpProduct,
} from "./heat-pump-schema";
export {
  heatPumpCatalogSchema,
  heatPumpProductSchema,
} from "./heat-pump-schema";
export type { HeatPumpProduct, HeatPumpCatalog } from "./heat-pump-schema";
export const heatPumpCatalog = heatPumpCatalogSchema.parse(raw);
export const heatPumpCatalogAtVersion = catalogHistory(
  [heatPumpCatalog],
  history,
  heatPumpCatalogSchema.parse,
);
export const heatPumpProductAtVersion = (id: string, version: string) =>
  heatPumpCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null;

export function heatPumpCapacity(
  point: HeatPumpProduct["operatingPoints"][number],
) {
  return {
    heatingW: point.maxHeatingW ?? point.heatingW,
    coolingW: point.maxCoolingW ?? point.coolingW,
    basis:
      point.maxHeatingW !== undefined && point.maxCoolingW !== undefined
        ? "massime dichiarate"
        : "dichiarate (massimi non disponibili)",
  };
}
