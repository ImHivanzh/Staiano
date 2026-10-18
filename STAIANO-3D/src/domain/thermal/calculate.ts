export const THERMAL_COEFFICIENT_W_M3 = 35 as const;
export function calculateThermal(areaM2: number, heightM: number) {
  if (
    !Number.isFinite(areaM2) ||
    !Number.isFinite(heightM) ||
    areaM2 <= 0 ||
    heightM <= 0
  )
    throw new Error("Superficie e altezza devono essere positive.");
  const volumeM3 = areaM2 * heightM;
  return { volumeM3, designLoadW: volumeM3 * THERMAL_COEFFICIENT_W_M3 };
}
export const wattsToBtuh = (watts: number) => watts * 3.412142;
