import raw from "../../../catalog-data/generated/hvac.json" with { type: "json" };
import history from "../../../catalog-data/generated/hvac-history.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import { hvacCatalogSchema, type HvacProduct } from "./hvac-schema";
export const hvacCatalog = hvacCatalogSchema.parse(raw);
export const hvacCatalogAtVersion = catalogHistory(
  [hvacCatalog],
  history,
  hvacCatalogSchema.parse,
);
export function hvacProductAtVersion(id: string, version: string) {
  return (
    hvacCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null
  );
}
/** Supplemental drawings may enrich an unchanged indoor model, never its historic performance. */
export function hvacDischargeConnection(product: HvacProduct | null) {
  if (!product || product.kind !== "ducted") return null;
  if (product.dischargeConnection) return product.dischargeConnection;
  const documented = hvacCatalog.products.find(
    (p) =>
      p.manufacturer === product.manufacturer &&
      p.indoorModel === product.indoorModel,
  );
  return documented?.dischargeConnection ?? null;
}
