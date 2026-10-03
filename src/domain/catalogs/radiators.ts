import cordivari from "../../../catalog-data/generated/cordivari.json";
import global from "../../../catalog-data/generated/global.json";
import { radiatorCatalogSchema } from "./radiator-schema";
export const radiatorCatalogs = [
  radiatorCatalogSchema.parse(cordivari),
  radiatorCatalogSchema.parse(global),
];
export const radiatorProducts = radiatorCatalogs.flatMap((c) => c.products);
