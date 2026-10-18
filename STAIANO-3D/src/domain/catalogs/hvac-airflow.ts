import type { HvacProduct } from "./hvac-schema";

export type MaximumAirflowChoice = {
  option: HvacProduct["airflowOptions"][number];
  index: number;
  airflowM3h: number;
};

/** Design flow always uses the highest published option, regardless of ordering. */
export function maximumAirflowOption(
  product: Pick<HvacProduct, "airflowOptions"> | null | undefined,
): MaximumAirflowChoice | null {
  let maximum: MaximumAirflowChoice | null = null;
  product?.airflowOptions.forEach((option, index) => {
    if (
      Number.isFinite(option.airflowM3h) &&
      option.airflowM3h > 0 &&
      (!maximum || option.airflowM3h > maximum.airflowM3h)
    )
      maximum = { option, index, airflowM3h: option.airflowM3h };
  });
  return maximum;
}
