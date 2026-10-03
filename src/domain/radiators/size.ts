import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
import { nominalLatticeSearch, type RadiatorProgress } from "./size-lattice";
export type { RadiatorProgress } from "./size-lattice";
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
  selectedManufacturer?: string;
  selectedFamily?: string;
  units: RadiatorUnit[];
  searchComplete: boolean;
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
export type RadiatorUnit = {
  variant: RadiatorVariant;
  elements: number;
  widthMm: number;
  powerW: number;
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
const totalWidth = (units: RadiatorUnit[]) =>
  units.reduce((s, u) => s + u.widthMm, 0);
const totalVolume = (units: RadiatorUnit[]) =>
  units.reduce(
    (s, u) => s + u.widthMm * u.variant.heightMm * u.variant.depthMm,
    0,
  );
const power = (units: RadiatorUnit[]) =>
  units.reduce((s, u) => s + u.powerW, 0);
function compareUnits(a: RadiatorUnit[], b: RadiatorUnit[]) {
  return (
    power(a) - power(b) ||
    totalWidth(a) - totalWidth(b) ||
    totalVolume(a) - totalVolume(b) ||
    imbalance(a.map((u) => u.powerW)) - imbalance(b.map((u) => u.powerW))
  );
}
function solutionFromUnits(
  units: RadiatorUnit[],
  requiredW: number,
  deltaTK: number,
  searchComplete: boolean,
): RadiatorSolution {
  units = [...units].sort(
    (a, b) => a.powerW - b.powerW || a.variant.id.localeCompare(b.variant.id),
  );
  const totalPowerW = power(units);
  return {
    units,
    searchComplete,
    variant: units[0].variant,
    elements: units.map((u) => u.elements),
    widthsMm: units.map((u) => u.widthMm),
    unitPowerW: units.map((u) => u.powerW),
    totalPowerW,
    excessW: totalPowerW - requiredW,
    marginPercent: (totalPowerW / requiredW - 1) * 100,
    deltaTK,
    log: [
      ...units.flatMap(({ variant: v, elements, powerW, widthMm }) => [
        deltaTK === v.referenceDeltaTK
          ? `${v.model}: resa nominale ${v.elementOutputW} W/elemento a ΔT ${deltaTK} K`
          : v.coefficientKm !== null
            ? `${v.model}: ${v.coefficientKm} × ${deltaTK}^${v.exponentN} W/elemento`
            : `${v.model}: ${v.elementOutputW} × (${deltaTK}/${v.referenceDeltaTK})^${v.exponentN} W/elemento`,
        `${elements} elementi: ${powerW} W; larghezza ${elements} × ${v.pitchMm} + ${v.widthAdditionMm} = ${widthMm} mm`,
      ]),
      `Richiesta ${requiredW} W; totale ${totalPowerW} W; eccesso ${totalPowerW - requiredW} W`,
      searchComplete
        ? "Ricerca completa sulle combinazioni commerciali ammesse dai vincoli. Priorità: eccesso, larghezza, volume, equilibrio delle potenze."
        : "Ricerca completa ancora in corso; soluzione provvisoria non certificata.",
    ],
  };
}
/** Complete search. Nominal decimals use an exact lattice; other formulas use unbounded branch-and-bound in the worker. */
export function sizeRadiators(
  requiredW: number,
  catalog: RadiatorVariant[],
  deltaTK: number,
  constraints: RadiatorConstraints,
  onProgress?: (value: RadiatorProgress) => void,
): RadiatorSolution[] {
  if (!Number.isFinite(requiredW) || requiredW <= 0)
    throw new Error("Fabbisogno stanza non valido.");
  if (
    !Number.isInteger(constraints.numberOfRadiators) ||
    constraints.numberOfRadiators < 1 ||
    constraints.numberOfRadiators > 10
  )
    throw new Error("Numero radiatori da 1 a 10.");
  if (!Number.isFinite(deltaTK) || deltaTK <= 0)
    throw new Error("ΔT deve essere positivo.");
  for (const name of [
    "maxWidthMm",
    "maxHeightMm",
    "maxDepthMm",
    "minElements",
    "maxElements",
  ] as const) {
    const value = constraints[name];
    if (
      value !== undefined &&
      (!Number.isFinite(value) ||
        value <= 0 ||
        ((name === "minElements" || name === "maxElements") &&
          !Number.isInteger(value)))
    )
      throw new Error(
        "Vincoli dimensionali ed elementi devono essere positivi e validi.",
      );
  }
  if ((constraints.minElements ?? 1) > (constraints.maxElements ?? Infinity))
    throw new Error("Minimo elementi maggiore del massimo.");
  const products = catalog.filter(
    (p) =>
      (!constraints.manufacturer ||
        p.manufacturer === constraints.manufacturer) &&
      (!constraints.family || p.family === constraints.family) &&
      p.heightMm <= (constraints.maxHeightMm ?? Infinity) &&
      p.depthMm <= (constraints.maxDepthMm ?? Infinity),
  );
  const solutions: RadiatorSolution[] = [];
  const options: RadiatorUnit[] = [];
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
    options.push(
      ...counts.map((elements) => ({
        variant,
        elements,
        widthMm: radiatorWidth(variant, elements),
        powerW: output * elements,
      })),
    );
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
    const units = best[1].map((elements) => ({
      variant,
      elements,
      widthMm: radiatorWidth(variant, elements),
      powerW: output * elements,
    }));
    // Evaluate the actual unit sum, never round a deficient combination up to the target.
    if (power(units) >= requiredW)
      solutions.push(solutionFromUnits(units, requiredW, deltaTK, true));
  }
  solutions.sort((a, b) => compareUnits(a.units, b.units));
  if (!options.length) return [];
  // Equal output with a larger footprint can never improve this objective.
  const byPower = new Map<number, RadiatorUnit>();
  for (const option of options) {
    const old = byPower.get(option.powerW);
    if (!old || compareUnits([option], [old]) < 0)
      byPower.set(option.powerW, option);
  }
  const choices = [...byPower.values()].sort((a, b) => a.powerW - b.powerW);
  let bestUnits = solutions[0]?.units ?? null;
  const consider = (units: RadiatorUnit[]) => {
    if (
      power(units) >= requiredW &&
      (!bestUnits || compareUnits(units, bestUnits) < 0)
    )
      bestUnits = [...units];
  };
  const lowerBound = (target: number, start: number) => {
    let low = start,
      high = choices.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (choices[mid].powerW < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  let states = 0,
    lastProgress = 0;
  const report = () => {
    if (Date.now() - lastProgress < 150) return;
    lastProgress = Date.now();
    onProgress?.({
      phase: "Certificazione combinazioni",
      states,
      bestPowerW: bestUnits ? power(bestUnits) : null,
    });
  };
  const lattice =
    deltaTK === 50 && constraints.numberOfRadiators > 2
      ? nominalLatticeSearch(
          options,
          requiredW,
          constraints.numberOfRadiators,
          bestUnits,
          onProgress,
        )
      : undefined;
  if (lattice) {
    solutions.push(solutionFromUnits(lattice, requiredW, deltaTK, true));
    const key = (solution: RadiatorSolution) =>
      solution.units
        .map((u) => `${u.variant.id}:${u.elements}`)
        .sort()
        .join("|");
    return [
      ...new Map(
        solutions
          .sort((a, b) => compareUnits(a.units, b.units))
          .map((s) => [key(s), s]),
      ).values(),
    ].map((solution) => ({
      ...solution,
      selectedManufacturer: constraints.manufacturer,
      selectedFamily: constraints.family,
    }));
  }
  const finishPair = (
    prefix: RadiatorUnit[],
    start: number,
    reportProgress: boolean,
  ) => {
    const prefixPower = power(prefix);
    for (let i = start; i < choices.length; i++) {
      states++;
      if (reportProgress) report();
      const a = choices[i];
      if (bestUnits && prefixPower + 2 * a.powerW > power(bestUnits) + 1e-8)
        break;
      let j = lowerBound(requiredW - prefixPower - a.powerW, i);
      while (
        j < choices.length &&
        power([...prefix, a, choices[j]]) < requiredW
      )
        j++;
      if (j < choices.length) consider([...prefix, a, choices[j]]);
    }
  };
  // Seed large searches by exactly replacing pairs within the best homogeneous candidates.
  if (constraints.numberOfRadiators > 2) {
    for (const solution of solutions.slice(0, 3)) {
      let seed = solution.units;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < seed.length - 1; i++) {
          const prefix = seed.filter(
            (_, index) => index !== i && index !== i + 1,
          );
          finishPair(prefix, 0, false);
          if (bestUnits) seed = bestUnits;
        }
      }
    }
  }
  const visit = (
    prefix: RadiatorUnit[],
    start: number,
    remaining: number,
  ): void => {
    if (start >= choices.length) return;
    const prefixPower = power(prefix);
    if (prefixPower + remaining * choices.at(-1)!.powerW < requiredW - 1e-8)
      return;
    if (remaining === 1) {
      let i = lowerBound(requiredW - prefixPower, start);
      while (i < choices.length && power([...prefix, choices[i]]) < requiredW)
        i++;
      if (i < choices.length) consider([...prefix, choices[i]]);
      return;
    }
    if (remaining === 2) {
      finishPair(prefix, start, constraints.numberOfRadiators > 2);
      return;
    }
    for (let i = start; i < choices.length; i++) {
      states++;
      report();
      if (
        bestUnits &&
        prefixPower + remaining * choices[i].powerW > power(bestUnits) + 1e-8
      )
        break;
      visit([...prefix, choices[i]], i, remaining - 1);
    }
  };
  visit([], 0, constraints.numberOfRadiators);
  if (bestUnits)
    solutions.push(solutionFromUnits(bestUnits, requiredW, deltaTK, true));
  const key = (solution: RadiatorSolution) =>
    solution.units
      .map((u) => `${u.variant.id}:${u.elements}`)
      .sort()
      .join("|");
  const unique = [
    ...new Map(
      solutions
        .sort((a, b) => compareUnits(a.units, b.units))
        .map((solution) => [key(solution), solution]),
    ).values(),
  ];
  return unique.map((solution) => ({
    ...solutionFromUnits(solution.units, requiredW, deltaTK, true),
    selectedManufacturer: constraints.manufacturer,
    selectedFamily: constraints.family,
  }));
}
