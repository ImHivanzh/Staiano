import raw from "../../../catalog-data/generated/vrv.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import { vrvCatalogSchema } from "./vrv-schema";
export {
  vrvCatalogSchema,
  vrvIndoorSchema,
  vrvOutdoorSchema,
} from "./vrv-schema";
export type { VrvCatalog, VrvIndoor, VrvOutdoor } from "./vrv-schema";
export const vrvCatalog = vrvCatalogSchema.parse(raw);
export const vrvCatalogAtVersion = catalogHistory(
  [vrvCatalog],
  "vrv",
  vrvCatalogSchema.parse,
);
export const vrvOutdoorAtVersion = (id: string, version: string) =>
  vrvCatalogAtVersion(version)?.outdoorUnits.find((unit) => unit.id === id) ??
  null;
export const vrvIndoorAtVersion = (id: string, version: string) =>
  vrvCatalogAtVersion(version)?.indoorUnits.find((unit) => unit.id === id) ??
  null;
