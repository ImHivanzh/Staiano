import snapshot from "./stoves.json" with { type: "json" };

export const stoveCatalog = snapshot;
export type StoveProduct = (typeof stoveCatalog.products)[number];
export const stoveBrands = ["Ravelli", "La Nordica Extraflame"] as const;
