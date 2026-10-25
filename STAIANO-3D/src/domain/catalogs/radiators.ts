import cordivari from "../../../catalog-data/generated/cordivari.json" with { type: "json" };
import global from "../../../catalog-data/generated/global.json" with { type: "json" };
import cordivariComfort from "../../../catalog-data/generated/cordivari-comfort.json" with { type: "json" };
import cordivariRange from "../../../catalog-data/generated/cordivari-range.json" with { type: "json" };
import zehnder from "../../../catalog-data/generated/zehnder.json" with { type: "json" };
import lazzarini from "../../../catalog-data/generated/lazzarini.json" with { type: "json" };
import familyPhotos from "../../../catalog-data/generated/radiator-family-photos.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import { radiatorCatalogSchema, type RadiatorVariant } from "./radiator-schema";
export const radiatorCatalogs = [
  radiatorCatalogSchema.parse(cordivari),
  radiatorCatalogSchema.parse(global),
  radiatorCatalogSchema.parse(cordivariComfort),
  radiatorCatalogSchema.parse(cordivariRange),
  radiatorCatalogSchema.parse(zehnder),
  radiatorCatalogSchema.parse(lazzarini),
];
export const radiatorProducts = radiatorCatalogs.flatMap((c) => c.products);
export function radiatorProductPhoto(product: RadiatorVariant) {
  return (
    product.productPhoto ??
    (
      familyPhotos as Record<
        string,
        NonNullable<RadiatorVariant["productPhoto"]>
      >
    )[`${product.manufacturer}|${product.family}`] ??
    null
  );
}
export const radiatorCatalogAtVersion = catalogHistory(
  radiatorCatalogs,
  "radiators",
  radiatorCatalogSchema.parse,
);
export function radiatorProductAtVersion(id: string, version: string) {
  return (
    radiatorCatalogAtVersion(version)?.products.find(
      (product) => product.id === id,
    ) ?? null
  );
}
