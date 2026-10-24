import snapshot from "./stoves.json" with { type: "json" };
import technical from "../../../catalog-data/generated/stoves-technical.json" with { type: "json" };
import { stoveTechnicalCatalogSchema } from "./stoves-technical-schema";

export const stoveTechnicalCatalog = stoveTechnicalCatalogSchema.parse(technical);
const stoveTechnicalById = new Map(stoveTechnicalCatalog.products.map((product) => [product.id, product]));
export const stoveCatalog = {
  ...snapshot,
  products: snapshot.products.map((product) => ({ ...product, technical: stoveTechnicalById.get(product.id) ?? null })),
};
export type StoveProduct = (typeof stoveCatalog.products)[number];
export const stoveBrands = ["Ravelli", "La Nordica Extraflame"] as const;
