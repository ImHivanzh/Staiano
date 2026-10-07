import raw from "../../../catalog-data/generated/heat-pumps.json";
import history from "../../../catalog-data/generated/heat-pumps-history.json";
import { heatPumpCatalogSchema } from "./heat-pump-schema";
export {
  heatPumpCatalogSchema,
  heatPumpProductSchema,
} from "./heat-pump-schema";
export type { HeatPumpProduct, HeatPumpCatalog } from "./heat-pump-schema";
export const heatPumpCatalog = heatPumpCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    heatPumpCatalogSchema.parse(data),
  ]),
);
versions.set(heatPumpCatalog.version, heatPumpCatalog);
export const heatPumpCatalogAtVersion = (version: string) =>
  versions.get(version) ?? null;
export const heatPumpProductAtVersion = (id: string, version: string) =>
  heatPumpCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null;
