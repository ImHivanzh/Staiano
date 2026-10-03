import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
export type RadiatorConstraints = {
  family: string;
  manufacturer: string;
  numberOfRadiators: number;
  maxWidthMm?: number;
  maxHeightMm?: number;
  maxDepthMm?: number;
  minElements?: number;
  maxElements?: number;
};
export type RadiatorSolution = {
  variant: RadiatorVariant;
  elements: number[];
  widthsMm: number[];
  unitPowerW: number[];
  totalPowerW: number;
  excessW: number;
  marginPercent: number;
  deltaTK: number;
  log: string[];
};
export function elementOutputAtDeltaT(
  product: RadiatorVariant,
  deltaTK: number,
): number {
  if (!Number.isFinite(deltaTK) || deltaTK <= 0)
    throw new Error("ΔT deve essere positivo.");
  if (deltaTK === product.referenceDeltaTK) return product.elementOutputW;
  if (product.exponentN === null)
    throw new Error(
      "Esponente n non disponibile. Resa a questo ΔT non verificabile.",
    );
  return product.coefficientKm !== null
    ? product.coefficientKm * deltaTK ** product.exponentN
    : product.elementOutputW *
        (deltaTK / product.referenceDeltaTK) ** product.exponentN;
}
export const radiatorWidth = (product: RadiatorVariant, elements: number) =>
  product.pitchMm * elements + product.widthAdditionMm;
function imbalance(elements: number[]) {
  const average = elements.reduce((a, b) => a + b, 0) / elements.length;
  return elements.reduce((sum, e) => sum + (e - average) ** 2, 0);
}
/** Exact integer-element search, allowing unequal batteries of the selected variant. */
export function sizeRadiators(
  requiredW: number,
  catalog: RadiatorVariant[],
  deltaTK: number,
  constraints: RadiatorConstraints,
): RadiatorSolution[] {
  if (!Number.isFinite(requiredW) || requiredW <= 0)
    throw new Error("Fabbisogno stanza non valido.");
  if (
    !Number.isInteger(constraints.numberOfRadiators) ||
    constraints.numberOfRadiators < 1 ||
    constraints.numberOfRadiators > 10
  )
    throw new Error("Numero radiatori da 1 a 10.");
  const products = catalog.filter(
    (p) =>
      p.manufacturer === constraints.manufacturer &&
      p.family === constraints.family &&
      p.heightMm <= (constraints.maxHeightMm ?? Infinity) &&
      p.depthMm <= (constraints.maxDepthMm ?? Infinity),
  );
  const solutions: RadiatorSolution[] = [];
  for (const variant of products) {
    let output: number;
    try {
      output = elementOutputAtDeltaT(variant, deltaTK);
    } catch {
      continue;
    }
    const counts = variant.commercialElementCounts.filter(
      (n) =>
        n >= (constraints.minElements ?? 1) &&
        n <= (constraints.maxElements ?? Infinity) &&
        radiatorWidth(variant, n) <= (constraints.maxWidthMm ?? Infinity),
    );
    if (!counts.length) continue;
    let totals = new Map<number, number[]>([[0, []]]);
    for (let unit = 0; unit < constraints.numberOfRadiators; unit++) {
      const next = new Map<number, number[]>();
      for (const [total, list] of totals)
        for (const elements of counts) {
          const sum = total + elements,
            distribution = [...list, elements].sort((a, b) => a - b),
            previous = next.get(sum);
          if (!previous || imbalance(distribution) < imbalance(previous))
            next.set(sum, distribution);
        }
      totals = next;
    }
    const best = [...totals]
      .filter(([n]) => n * output >= requiredW)
      .sort(([a], [b]) => a - b)[0];
    if (!best) continue;
    const elements = best[1],
      totalPowerW = best[0] * output;
    const formula =
      deltaTK === variant.referenceDeltaTK
        ? `Resa nominale: ${output} W/elemento a ΔT ${deltaTK} K`
        : variant.coefficientKm !== null
          ? `${variant.coefficientKm} × ${deltaTK}^${variant.exponentN} = ${output} W/elemento`
          : `${variant.elementOutputW} × (${deltaTK}/${variant.referenceDeltaTK})^${variant.exponentN} = ${output} W/elemento`;
    solutions.push({
      variant,
      elements,
      widthsMm: elements.map((n) => radiatorWidth(variant, n)),
      unitPowerW: elements.map((n) => output * n),
      totalPowerW,
      excessW: totalPowerW - requiredW,
      marginPercent: (totalPowerW / requiredW - 1) * 100,
      deltaTK,
      log: [
        formula,
        `${elements.join(" + ")} elementi × ${output} W = ${totalPowerW} W`,
        `Richiesta ${requiredW} W; eccesso ${totalPowerW - requiredW} W`,
        `Larghezza = elementi × ${variant.pitchMm} + ${variant.widthAdditionMm} mm`,
        "Ricerca tra batterie commerciali della stessa variante; elementi distribuiti senza divisione forzata a metà.",
      ],
    });
  }
  return solutions.sort(
    (a, b) =>
      a.excessW - b.excessW ||
      a.widthsMm.reduce((n, w) => n + w, 0) -
        b.widthsMm.reduce((n, w) => n + w, 0),
  );
}
