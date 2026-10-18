import type { RadiatorVariant } from "../catalogs/radiator-schema";

export const radiatorFamilyGroup = (family: string) =>
  family.replace(/ \d+ colonne$/, "");

export function radiatorSizeChoices(products: RadiatorVariant[]) {
  return [
    ...new Map(
      products.map((product) => [
        `${product.heightMm}|${product.interaxisMm}`,
        { heightMm: product.heightMm, interaxisMm: product.interaxisMm },
      ]),
    ).values(),
  ].sort((a, b) => a.heightMm - b.heightMm || a.interaxisMm - b.interaxisMm);
}
