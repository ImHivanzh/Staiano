import raw from "../../../catalog-data/generated/flexible-ducts.json" with { type: "json" };

export const flexibleDuctProducts = raw.products;
export type FlexibleDuctProductId = (typeof flexibleDuctProducts)[number]["id"];

export function flexibleDuctInsulationMm(productId?: string | null) {
  // Generic silver hose: 25 mm insulation chosen by the user; ETF10 keeps its uninsulated construction.
  return productId === "ecoclima-etf10" ? 0 : 25;
}

export function flexibleDuctOuterRadiusM(diameterMm: number, productId?: string | null) {
  return diameterMm / 2000 + flexibleDuctInsulationMm(productId) / 1000;
}

export function flexibleDuctMinimumRadiusFactor(
  productId: string | null | undefined,
  diameterMm: number | null | undefined,
) {
  const product = flexibleDuctProducts.find((item) => item.id === productId);
  return product && diameterMm && product.diametersMm.includes(diameterMm)
    ? product.minimumBendRadiusFactor
    : 1;
}

export function flexibleDuctPressureLossPaM(
  productId: string | null | undefined,
  diameterMm: number | null | undefined,
  airflowM3h: number | null | undefined,
) {
  if (!diameterMm || airflowM3h === null || airflowM3h === undefined)
    return null;
  const product = flexibleDuctProducts.find((item) => item.id === productId);
  return (
    product?.pressureLosses.find(
      (row) => row.diameterMm === diameterMm && row.airflowM3h === airflowM3h,
    )?.pressureDropPaM ?? null
  );
}
