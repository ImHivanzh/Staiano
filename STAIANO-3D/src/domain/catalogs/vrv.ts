import raw from "../../../catalog-data/generated/vrv.json";
import history from "../../../catalog-data/generated/vrv-history.json";
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
  history,
  vrvCatalogSchema.parse,
);
export const vrvOutdoorAtVersion = (id: string, version: string) =>
  vrvCatalogAtVersion(version)?.outdoorUnits.find((unit) => unit.id === id) ??
  null;
export const vrvIndoorAtVersion = (id: string, version: string) =>
  vrvCatalogAtVersion(version)?.indoorUnits.find((unit) => unit.id === id) ??
  null;
