import type { RadiatorUnit } from "./size";

export type RadiatorProgress = {
  phase: string;
  states: number;
  bestPowerW: number | null;
};
type Option = {
  unit: RadiatorUnit;
  integerPower: number;
  deficit: number;
  volume: number;
  squaredPower: number;
};
type Node = {
  option: Option;
  next: Node | null;
  volume: number;
  squaredPower: number;
};

/** Published decimal coefficients are scaled symbolically. Actual formula outputs are never rounded. */
export function nominalLatticeSearch(
  units: RadiatorUnit[],
  requiredW: number,
  count: number,
  incumbent: RadiatorUnit[] | null,
  progress?: (value: RadiatorProgress) => void,
): RadiatorUnit[] | undefined {
  if (!units.every((u) => u.variant.referenceDeltaTK === 50) || !units.length)
    return undefined;
  const decimalPlaces = (value: number) => {
    const text = String(value);
    if (text.includes("e")) return null;
    return text.split(".")[1]?.length ?? 0;
  };
  const precisions = units.map((u) => decimalPlaces(u.variant.elementOutputW));
  if (precisions.some((p) => p === null)) return undefined;
  const digits = Math.max(...(precisions as number[])),
    factor = 10 ** digits;
  const integerCoefficient = (value: number) => {
    const [whole, fractional = ""] = String(value).split(".");
    return Number(BigInt(whole + fractional.padEnd(digits, "0")));
  };
  const maxRate = Math.max(
    ...units.map((u) => integerCoefficient(u.variant.elementOutputW)),
  );
  const options: Option[] = units.map((unit) => {
    const rate = integerCoefficient(unit.variant.elementOutputW);
    return {
      unit,
      integerPower: rate * unit.elements,
      deficit: (maxRate - rate) * unit.elements,
      volume: unit.widthMm * unit.variant.heightMm * unit.variant.depthMm,
      squaredPower: unit.powerW ** 2,
    };
  });
  if (options.some((o) => !Number.isSafeInteger(o.integerPower)))
    return undefined;
  const pitch = units[0].variant.pitchMm,
    addition = units[0].variant.widthAdditionMm;
  // This exact secondary DP uses the commercial family's common element pitch and end caps.
  if (
    !units.every(
      (u) =>
        u.variant.pitchMm === pitch && u.variant.widthAdditionMm === addition,
    )
  )
    return undefined;
  const sourceTotal = (list: RadiatorUnit[]) =>
    list.reduce(
      (s, u) => s + integerCoefficient(u.variant.elementOutputW) * u.elements,
      0,
    );
  const upper = incumbent
    ? sourceTotal(incumbent)
    : Math.max(...options.map((o) => o.integerPower)) * count;
  const minimumPower = Math.min(...options.map((o) => o.integerPower));
  const words = Math.floor(upper / 32) + 1;
  // Choose the complete branch search when an exact lattice would allocate too much memory.
  if (
    !Number.isSafeInteger(upper) ||
    words * 4 * (count + 1) > 64 * 1024 * 1024
  )
    return undefined;
  const reachable: Uint32Array[] = [new Uint32Array(words)];
  reachable[0][0] = 1;
  const powers = [...new Set(options.map((o) => o.integerPower))].sort(
    (a, b) => a - b,
  );
  let states = 0,
    lastProgress = 0;
  const report = (phase: string, bestPowerW: number | null = null) => {
    if (Date.now() - lastProgress < 150) return;
    lastProgress = Date.now();
    progress?.({ phase, states, bestPowerW });
  };
  for (let k = 1; k <= count; k++) {
    const previous = reachable[k - 1],
      next = new Uint32Array(words);
    const limit = upper - (count - k) * minimumPower;
    const previousLimit = k === 1 ? 0 : upper - (count - k + 1) * minimumPower;
    const previousWords = Math.floor(previousLimit / 32) + 1;
    for (const shift of powers) {
      if (shift > limit) break;
      const wordShift = shift >>> 5,
        bitShift = shift & 31;
      const end = Math.min(
        previousWords,
        Math.floor(limit / 32) + 1 - wordShift,
      );
      for (let source = 0; source < end; source++) {
        const bits = previous[source];
        if (!bits) continue;
        const destination = source + wordShift;
        next[destination] |= bits << bitShift;
        if (bitShift && destination + 1 < words)
          next[destination + 1] |= bits >>> (32 - bitShift);
      }
      states += end;
      report(`Potenza: ${k}/${count} radiatori`);
    }
    const lastWord = Math.floor(limit / 32),
      bitsInLastWord = (limit & 31) + 1;
    if (bitsInLastWord < 32)
      next[lastWord] &= 0xffffffff >>> (32 - bitsInLastWord);
    next.fill(0, lastWord + 1);
    reachable.push(next);
  }
  const contains = (k: number, value: number) =>
    value >= 0 &&
    value <= upper &&
    !!(reachable[k][value >>> 5] & (1 << (value & 31)));
  // Include a possible boundary affected by binary evaluation, then validate the original JS sum.
  const boundaryError = Math.max(
    1e-9,
    Math.abs(requiredW * factor) * Number.EPSILON * count * 4,
  );
  let target = Math.max(
    count * minimumPower,
    Math.ceil(requiredW * factor - boundaryError),
  );
  const sortedOptions = [...options].sort(
    (a, b) => b.integerPower / a.unit.widthMm - a.integerPower / b.unit.widthMm,
  );
  for (; target <= upper; target++) {
    if (!contains(count, target)) continue;
    let remainder = target;
    const witness: RadiatorUnit[] = [];
    for (let k = count; k > 0; k--) {
      const option = sortedOptions.find((o) =>
        contains(k - 1, remainder - o.integerPower),
      );
      if (!option)
        throw new Error("Ricostruzione radiatori nominali incoerente.");
      witness.push(option.unit);
      remainder -= option.integerPower;
    }
    const minimumElements = Math.max(
      count * Math.min(...units.map((u) => u.elements)),
      Math.ceil(target / maxRate),
    );
    const maximumElements = witness.reduce((s, u) => s + u.elements, 0);
    const minElements = Math.min(...units.map((u) => u.elements)),
      maxElements = Math.max(...units.map((u) => u.elements));
    const bySingle = new Map<string, Option>();
    for (const option of options) {
      const key = `${option.unit.elements}:${option.deficit}`,
        old = bySingle.get(key);
      if (
        !old ||
        option.volume < old.volume ||
        (option.volume === old.volume && option.squaredPower < old.squaredPower)
      )
        bySingle.set(key, option);
    }
    const ordered = [...bySingle.values()].sort(
      (a, b) => a.deficit - b.deficit,
    );
    const memo = new Map<string, Node | null>();
    const visit = (
      k: number,
      elements: number,
      deficit: number,
    ): Node | null => {
      states++;
      if ((states & 8191) === 0)
        report("Ingombro e bilanciamento", target / factor);
      if (
        elements < k * minElements ||
        elements > k * maxElements ||
        deficit < 0
      )
        return null;
      if (k === 1) {
        const option = bySingle.get(`${elements}:${deficit}`);
        return option
          ? {
              option,
              next: null,
              volume: option.volume,
              squaredPower: option.squaredPower,
            }
          : null;
      }
      const key = `${k}:${elements}:${deficit}`;
      if (memo.has(key)) return memo.get(key)!;
      let best: Node | null = null;
      for (const option of ordered) {
        if (option.deficit > deficit) break;
        const tail = visit(
          k - 1,
          elements - option.unit.elements,
          deficit - option.deficit,
        );
        if (!tail) continue;
        const volume = option.volume + tail.volume,
          squaredPower = option.squaredPower + tail.squaredPower;
        if (
          !best ||
          volume < best.volume ||
          (volume === best.volume && squaredPower < best.squaredPower)
        )
          best = { option, next: tail, volume, squaredPower };
      }
      memo.set(key, best);
      return best;
    };
    for (
      let elements = minimumElements;
      elements <= maximumElements;
      elements++
    ) {
      let node = visit(count, elements, elements * maxRate - target);
      if (!node) continue;
      const result: RadiatorUnit[] = [];
      while (node) {
        result.push(node.option.unit);
        node = node.next;
      }
      result.sort(
        (a, b) =>
          a.powerW - b.powerW || a.variant.id.localeCompare(b.variant.id),
      );
      if (result.reduce((s, u) => s + u.powerW, 0) >= requiredW) return result;
      // A floating boundary needs full enumeration rather than a false certificate.
      return undefined;
    }
  }
  return undefined;
}
