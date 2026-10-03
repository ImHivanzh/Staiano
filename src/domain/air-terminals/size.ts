import type {
  AirTerminalFamily,
  AirTerminalVariant,
  OperatingPoint,
} from "@/domain/catalogs/air-terminal-schema";
export const MAX_NOISE_DBA = 37;
export type AirTerminalSolution = {
  variant: AirTerminalVariant;
  operatingPoint: OperatingPoint;
  requiredAirflowPerPointM3h: number;
  theoreticalLengthM: number | null;
  commercialLengthM: number | null;
  quantityPerPoint: number;
  numberOfPoints: number;
  availableAirflowPerPointM3h: number;
  log: string[];
};
export function acousticUpperBound(point: OperatingPoint): number | null {
  return point.noiseDbA ?? point.noiseUpperBoundDbA;
}
export function sizeAirTerminal(
  requiredAirflowM3h: number,
  numberOfPoints: number,
  family: AirTerminalFamily,
  use: "supply" | "return",
): AirTerminalSolution[] {
  if (!Number.isFinite(requiredAirflowM3h) || requiredAirflowM3h <= 0)
    throw new Error("Portata richiesta positiva necessaria.");
  if (
    !Number.isInteger(numberOfPoints) ||
    numberOfPoints < 1 ||
    numberOfPoints > 100
  )
    throw new Error("Numero punti da 1 a 100.");
  if (!family.use.includes(use)) return [];
  const perPoint = requiredAirflowM3h / numberOfPoints,
    solutions: AirTerminalSolution[] = [];
  for (const variant of family.variants)
    for (const point of variant.operatingPoints) {
      if (point.quality === "review") continue;
      const noise = acousticUpperBound(point);
      if (noise === null || noise > MAX_NOISE_DBA) continue;
      if (family.isLinearPerMeter) {
        if (!point.airflowPerMeterM3h) continue;
        const theoreticalLengthM = perPoint / point.airflowPerMeterM3h;
        const lengthMm = variant.commercialLengthsMm
          .toSorted((a, b) => a - b)
          .find((mm) => (mm / 1000) * point.airflowPerMeterM3h! >= perPoint);
        if (lengthMm === undefined) continue;
        const commercialLengthM = lengthMm / 1000,
          available = point.airflowPerMeterM3h * commercialLengthM;
        solutions.push({
          variant,
          operatingPoint: point,
          requiredAirflowPerPointM3h: perPoint,
          theoreticalLengthM,
          commercialLengthM,
          quantityPerPoint: 1,
          numberOfPoints,
          availableAirflowPerPointM3h: available,
          log: [
            `${requiredAirflowM3h} / ${numberOfPoints} = ${perPoint} m³/h per punto`,
            `${perPoint} / ${point.airflowPerMeterM3h} = ${theoreticalLengthM} m teorici`,
            `Misura commerciale ${commercialLengthM} m; portata di riferimento ${available} m³/h`,
            `Rumore di riferimento ${point.noiseLabel} dB(A), lunghezza di prova ${point.referenceLengthM ?? "non dichiarata"} m`,
            family.operatingConditions,
          ],
        });
      } else {
        const quantity = Math.ceil(perPoint / point.airflowM3h);
        // Noise data is per unit. Multiple-unit combined room noise is not claimed.
        solutions.push({
          variant,
          operatingPoint: point,
          requiredAirflowPerPointM3h: perPoint,
          theoreticalLengthM: null,
          commercialLengthM: null,
          quantityPerPoint: quantity,
          numberOfPoints,
          availableAirflowPerPointM3h: quantity * point.airflowM3h,
          log: [
            `${requiredAirflowM3h} / ${numberOfPoints} = ${perPoint} m³/h per punto`,
            `${quantity} unità × ${point.airflowM3h} = ${quantity * point.airflowM3h} m³/h`,
            `Rumore per unità: ${point.noiseLabel} dB(A); rumore complessivo da verificare.`,
            ...(typeof point.openingMm === "number"
              ? [`Apertura cono S: ${point.openingMm} mm`]
              : []),
            family.operatingConditions,
          ],
        });
      }
    }
  return solutions.sort(
    (a, b) =>
      (a.commercialLengthM ?? a.quantityPerPoint) -
        (b.commercialLengthM ?? b.quantityPerPoint) ||
      a.availableAirflowPerPointM3h - b.availableAirflowPerPointM3h ||
      (acousticUpperBound(a.operatingPoint) ?? Infinity) -
        (acousticUpperBound(b.operatingPoint) ?? Infinity),
  );
}
