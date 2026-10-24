import raw from "../../../catalog-data/generated/fan-coils.json" with { type: "json" };
import history from "../../../catalog-data/generated/fan-coils-history.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
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
export const fanCoilCatalogAtVersion = catalogHistory(
  [fanCoilCatalog],
  history,
  fanCoilCatalogSchema.parse,
);
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

export type FanCoilCategory = "ducted" | "ambient";

export function isConcealedFanCoil(
  product: Pick<FanCoilProduct, "family"> | null | undefined,
) {
  return ["AirLeaf SLI", "FCZ P", "FCZ PO"].includes(product?.family ?? "");
}

/**
 * Prodotti che il costruttore dichiara per installazione ad incasso: il corpo
 * resta nella parete o nel vuoto tecnico e non va posato a vista. Le famiglie
 * Innova SLI e Aermec FCZ P/PO riportano la voce nelle caratteristiche.
 */
export function isRecessedFanCoil(
  product: Pick<FanCoilProduct, "family" | "features"> | null | undefined,
) {
  return (
    isConcealedFanCoil(product) ||
    (product?.features ?? []).some((feature) =>
      /installazione ad incasso/i.test(feature),
    )
  );
}

/**
 * Serie pubblicate come canalizzabili: Aermec FCZ, FCZ P e FCZ PO (scheda
 * FCZ-P_I_UN50_16, «canalizzabile con motore potenziato e prevalenza utile»).
 * Restano ventilconvettori: la categoria separa solo la distribuzione d'aria.
 */
const DUCTED_SERIES: Readonly<Record<string, readonly string[]>> = {
  Aermec: ["FCZ", "FCZ P", "FCZ PO"],
};

export const fanCoilCategoryLabels: Record<FanCoilCategory, string> = {
  ducted: "Ventilconvettori canalizzabili",
  ambient: "Ventilconvettori a parete e a soffitto",
};

export function fanCoilCategory(product: FanCoilProduct): FanCoilCategory {
  return DUCTED_SERIES[product.manufacturer]?.includes(product.family)
    ? "ducted"
    : "ambient";
}

/** Ordine di presentazione: prima i canalizzabili, poi gli altri. */
export const fanCoilCategories: readonly FanCoilCategory[] = [
  "ducted",
  "ambient",
];

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
