export const THERMAL_COEFFICIENT_W_M3 = 35 as const;
export function calculateThermal(
  areaM2: number,
  heightM: number,
  coefficientWm3: number = THERMAL_COEFFICIENT_W_M3,
) {
  if (
    !Number.isFinite(areaM2) ||
    !Number.isFinite(heightM) ||
    areaM2 <= 0 ||
    heightM <= 0
  )
    throw new Error("Superficie e altezza devono essere positive.");
  if (!Number.isFinite(coefficientWm3) || coefficientWm3 <= 0)
    throw new Error("Il coefficiente termico deve essere positivo e finito.");
  const volumeM3 = areaM2 * heightM;
  return { volumeM3, designLoadW: volumeM3 * coefficientWm3 };
}
export const wattsToBtuh = (watts: number) => watts * 3.412142;
