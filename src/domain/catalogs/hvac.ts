import raw from "../../../catalog-data/generated/hvac.json";
import history from "../../../catalog-data/generated/hvac-history.json";
import { hvacCatalogSchema, type HvacProduct } from "./hvac-schema";
export const hvacCatalog = hvacCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    hvacCatalogSchema.parse(data),
  ]),
);
versions.set(hvacCatalog.version, hvacCatalog);
export function hvacCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
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
