import raw from "../../../catalog-data/generated/fan-coils.json";
import history from "../../../catalog-data/generated/fan-coils-history.json";
import {
  fanCoilCatalogSchema,
  type FanCoilProduct,
  type FanCoilControl,
} from "./fan-coil-schema";
export {
  fanCoilCatalogSchema,
  fanCoilProductSchema,
  controlProductSchema,
} from "./fan-coil-schema";
export type {
  FanCoilProduct,
  FanCoilControl,
  FanCoilCatalog,
  FanCoilOperatingPoint,
} from "./fan-coil-schema";
export const fanCoilCatalog = fanCoilCatalogSchema.parse(raw);
const versions = new Map(
  Object.entries(history).map(([version, data]) => [
    version,
    fanCoilCatalogSchema.parse(data),
  ]),
);
versions.set(fanCoilCatalog.version, fanCoilCatalog);
export function fanCoilCatalogAtVersion(version: string) {
  return versions.get(version) ?? null;
}
export function fanCoilProductAtVersion(id: string, version: string) {
  return (
    fanCoilCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null
  );
}
export function fanCoilControlAtVersion(id: string, version: string) {
  return (
    fanCoilCatalogAtVersion(version)?.controls.find((p) => p.id === id) ?? null
  );
}

/** Only the documented M7 families and board/pipe pairings can be associated. */
export function controllerBoardFor(
  product: FanCoilProduct,
  control: FanCoilControl,
): string | null {
  if (
    product.manufacturer !== "Innova" ||
    control.manufacturer !== product.manufacturer ||
    control.series !== "M7" ||
    !["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"].includes(product.family) ||
    !control.compatibleFamilies.includes(product.family)
  )
    return null;
  const board =
    control.connection === "bluetooth"
      ? product.pipes === "2"
        ? "ESE746II"
        : "ESE741II"
      : product.pipes === "2"
        ? "ESE745II"
        : "ESE748II";
  return control.requiredBoards.includes(board) ? board : null;
}
export function compatibleFanCoilControls(
  product: FanCoilProduct,
  catalog = fanCoilCatalog,
) {
  return catalog.controls.filter(
    (control) => controllerBoardFor(product, control) !== null,
  );
}
