import raw from "../../../catalog-data/generated/flexible-ducts.json" with { type: "json" };

export const flexibleDuctProducts = raw.products;
export type FlexibleDuctProductId = (typeof flexibleDuctProducts)[number]["id"];

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
