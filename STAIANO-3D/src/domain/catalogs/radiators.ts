import cordivari from "../../../catalog-data/generated/cordivari.json";
import global from "../../../catalog-data/generated/global.json";
import cordivariComfort from "../../../catalog-data/generated/cordivari-comfort.json";
import cordivariRange from "../../../catalog-data/generated/cordivari-range.json";
import zehnder from "../../../catalog-data/generated/zehnder.json";
import lazzarini from "../../../catalog-data/generated/lazzarini.json";
import familyPhotos from "../../../catalog-data/generated/radiator-family-photos.json";
import history from "../../../catalog-data/generated/radiator-history.json";
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
  history,
  radiatorCatalogSchema.parse,
);
export function radiatorProductAtVersion(id: string, version: string) {
  return (
    radiatorCatalogAtVersion(version)?.products.find(
      (product) => product.id === id,
    ) ?? null
  );
}
