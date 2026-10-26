import type { Project } from "@/schemas/project";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { ecoclimaPriceCatalog } from "@/domain/catalogs/ecoclima-prices";
import officialArticles from "../../../catalog-data/generated/ecoclima-articles.json" with { type: "json" };
import { terminalFinishPrice, terminalFinishLabel } from "./finishes";
import type { AirTerminalVariant } from "@/domain/catalogs/air-terminal-schema";
import type {
  EcoclimaPrice,
  EcoclimaPriceCatalog,
  TerminalAccessorySpecification,
  TerminalCommercialOptions,
} from "@/domain/catalogs/ecoclima-price-schema";

type InstalledTerminal = Project["airTerminals"][number] & {
  commercialOptions?: TerminalCommercialOptions;
};
type BomProject = Pick<Project, "airTerminals" | "hvacSystems"> &
  Partial<Pick<Project, "plenums">>;
/**
 * Un plenum salvato resta l'accessorio di catalogo finché coincide con la
 * scheda; appena l'operatore ne cambia quota o modello diventa una quotazione
 * separata, distinta dal prezzo del terminale.
 */
function savedPlenumIsCatalogue(
  plenum: Project["plenums"][number],
  specification: TerminalAccessorySpecification | null,
) {
  const spec = specification?.plenum;
  const expectedSide = spec?.connectionPosition === "upper" ? "upper" : "rear";
  const sidesMatch = Array.from(
    { length: plenum.portCount ?? 1 },
    (_, index) =>
      plenum.connectionPositions?.[index] ??
      plenum.connectionPosition ??
      spec?.connectionPosition,
  ).every((side) => (side === "lateral" ? "rear" : side) === expectedSide);
  return (
    !!spec &&
    sidesMatch &&
    plenum.model === spec.modelCode &&
    plenum.widthMm === spec.lengthMm &&
    plenum.heightMm === spec.heightMm &&
    plenum.depthMm === spec.widthMm &&
    (plenum.portCount ?? 1) === spec.portCount &&
    (plenum.portDiameterMm ?? 160) === spec.portDiameterMm &&
    (plenum.material ?? "insulated") === "insulated" &&
    (!plenum.shape || plenum.shape === "rectangular")
  );
}
export type EcoclimaBomLine = {
  id: string;
  terminalIds: string[];
  systemId: string | null;
  familyCode: string;
  kind: EcoclimaPrice["kind"] | "machine-plenum";
  label: string;
  /** Dimensioni nominali di catalogo (L x H x P, diametro o feritoie). */
  dimensions: string | null;
  sku: string | null;
  quantity: number | null;
  unitPriceCents: number | null;
  extendedPriceCents: number | null;
  currency: "EUR";
  status: "known" | "unknown";
  reason: string | null;
  sourceMetadata: EcoclimaPrice["sourceMetadata"] | null;
  quantitySourceMetadata: EcoclimaPrice["sourceMetadata"] | null;
};
export type EcoclimaBom = {
  catalogVersion: string;
  revision: string | null;
  currency: "EUR";
  taxTreatment: "not-specified-by-source";
  lines: EcoclimaBomLine[];
  knownSubtotalCents: number;
  totalCents: number | null;
  complete: boolean;
  missingLineCount: number;
};

/** Nominal catalogue dimensions are distinct from the rendered outer face. */
export function terminalCommercialDimensions(terminal: InstalledTerminal) {
  if (terminal.legacyUnverified) return null;
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  const variant = family?.variants.find(
    (item) => item.id === terminal.productId,
  );
  if (!family || !variant) return null;
  return {
    lengthMm: family.isLinearPerMeter ? terminal.widthMm : variant.lengthMm,
    widthMm: family.isLinearPerMeter ? null : variant.widthMm,
    heightMm: family.isLinearPerMeter ? null : variant.heightMm,
    diameterMm:
      variant.nominalDiameterMm ??
      (family.shape === "circle"
        ? (variant.widthMm ?? variant.heightMm)
        : null) ??
      (terminal.family === "EBCV"
        ? (terminal.commercialOptions?.mountingDuctDiameterMm ?? null)
        : null),
    slotCount: variant.slotCount,
    slotWidthMm: variant.slotWidthMm,
  };
}
/** Dimensioni nominali di catalogo: L x H x P, diametro o feritoie. */
export function terminalDimensionsText(
  terminal: InstalledTerminal,
): string | null {
  const dimensions = terminalCommercialDimensions(terminal);
  if (!dimensions) return null;
  const sides = [
    dimensions.lengthMm === null ? null : `L ${dimensions.lengthMm}`,
    dimensions.heightMm === null ? null : `H ${dimensions.heightMm}`,
    dimensions.widthMm === null ? null : `P ${dimensions.widthMm}`,
  ].filter((item): item is string => item !== null);
  const parts = sides.length ? [`${sides.join(" × ")} mm`] : [];
  if (dimensions.diameterMm !== null)
    parts.push(`Ø ${dimensions.diameterMm} mm`);
  if (dimensions.slotCount)
    parts.push(
      `${dimensions.slotCount} ${dimensions.slotCount === 1 ? "feritoia" : "feritoie"}${dimensions.slotWidthMm ? ` da ${dimensions.slotWidthMm} mm` : ""}`,
    );
  return parts.join("; ") || null;
}
function dimensionsMatch(
  dimensions: EcoclimaPrice["dimensions"],
  actual: ReturnType<typeof terminalCommercialDimensions>,
) {
  return (
    !!actual &&
    Object.entries(dimensions).every(
      ([key, value]) =>
        value === null || value === actual[key as keyof typeof actual],
    )
  );
}
const commercialPageFamily: Record<string, string> = {
  EDE1R: "EDE1",
  EDE2R: "EDE2",
  "EDRA-PQ": "EDRA",
  "EDCS-PQ": "EDCS",
  "EDRC-PQR": "EDRC",
  "EDRCS-PQR": "EDRCS",
  "EDRCS THERM": "EDRCS",
  "EDRCS-PQR THERM": "EDRCS",
  EDRFQ: "EDRF",
  EDRFQB: "EDRFB",
  "EDQV-PQ": "EDQV",
  "EDSC-CC": "EDSC-C",
  "EDSC-Q": "EDSC-C",
  "EDU-M": "EDU",
  "EDU-F": "EDU",
  "EDU-LFS": "EDU",
  "EDU-SM": "EDU-S",
  "EDEA-SD": "EDEA",
  "EVVAIR-C": "EVVAIR",
  "EVVAIR-Q": "EVVAIR",
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((number) => [`EDC${number}`, "EDC"]),
  ),
  ...Object.fromEntries(
    [
      "EDFL-10",
      "EDFL-20",
      "EDFL-30",
      "EDFL-40",
      "EDFL-50",
      "EDFLB-20",
      "EDFLB-40",
      "EDFLB-50",
    ].map((family) => [family, "EDFL"]),
  ),
  ...Object.fromEntries(
    [
      "EDFLNA-10",
      "EDFLNA-20",
      "EDFLNA-40",
      "EDFLNA-50",
      "EDFLBNA-10",
      "EDFLBNA-20",
      "EDFLBNA-40",
      "EDFLBNA-50",
    ].map((family) => [family, "EDFLNA"]),
  ),
};
function familyMatches(priceFamily: string, family: string) {
  return (
    priceFamily.toUpperCase() === family.toUpperCase() ||
    commercialPageFamily[family] === priceFamily ||
    (priceFamily === "EDSC" && family.startsWith("EDSC-")) ||
    (priceFamily === "EDSC-C" && /^(EDSC-CC|EDSC-Q)$/.test(family))
  );
}

/** Published inlet positions for this terminal family, with the original drawing. */
export function terminalPlenumConnections(
  family: string,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
) {
  return [
    ...new Map(
      catalog.accessorySpecifications
        .filter((item) => familyMatches(item.familyCode, family) && item.plenum)
        .map(
          (item) =>
            [
              item.plenum!.connectionPosition,
              {
                position: item.plenum!.connectionPosition,
                sourceUrl: (item.plenum!.sourceMetadata ?? item.sourceMetadata)
                  .sourceUrl,
              },
            ] as const,
        ),
    ).values(),
  ];
}
export function terminalPlenumSpecification(
  family: string,
  variant: AirTerminalVariant,
  lengthMm?: number | null,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
) {
  const dimensions = {
    lengthMm: lengthMm ?? variant.lengthMm,
    widthMm: variant.widthMm,
    heightMm: variant.heightMm,
    diameterMm: variant.nominalDiameterMm ?? null,
    slotCount: variant.slotCount,
    slotWidthMm: variant.slotWidthMm,
  };
  const plenums = catalog.accessorySpecifications
    .filter(
      (item) =>
        familyMatches(item.familyCode, family) &&
        item.plenum &&
        dimensionsMatch(item.dimensions, dimensions),
    )
    .map((item) => item.plenum!);
  return plenums.length &&
    plenums.every((item) => JSON.stringify(item) === JSON.stringify(plenums[0]))
    ? plenums[0]
    : null;
}
export function continuityModuleLengths(
  familyCode: string,
  variant: AirTerminalVariant,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
) {
  return [
    ...new Set(
      catalog.accessorySpecifications
        .filter(
          (item) =>
            item.continuitySupported &&
            familyMatches(item.familyCode, familyCode) &&
            item.dimensions.lengthMm !== null &&
            (item.dimensions.slotCount === null ||
              item.dimensions.slotCount === variant.slotCount) &&
            (item.dimensions.slotWidthMm === null ||
              item.dimensions.slotWidthMm === variant.slotWidthMm),
        )
        .map((item) => item.dimensions.lengthMm!),
    ),
  ].sort((a, b) => a - b);
}
export function commercialChoicesForTerminal(
  terminal: InstalledTerminal,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
) {
  const dimensions = terminalCommercialDimensions(terminal);
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  const variant = family?.variants.find(
    (item) => item.id === terminal.productId,
  );
  return catalog.prices.filter(
    (price) =>
      price.kind === "terminal" &&
      familyMatches(price.familyCode, terminal.family) &&
      (dimensionsMatch(price.dimensions, dimensions) ||
        (terminal.family === "EBCV" &&
          terminal.commercialOptions?.mountingDuctDiameterMm == null &&
          !!dimensions &&
          Object.entries(price.dimensions).every(
            ([key, value]) =>
              key === "diameterMm" ||
              value === null ||
              value === dimensions[key as keyof typeof dimensions],
          ))) &&
      (Object.values(price.dimensions).some((value) => value !== null) ||
        price.technicalVariantIds.length > 0 ||
        family?.variants.length === 1) &&
      (!price.technicalVariantIds.length ||
        price.technicalVariantIds.includes(terminal.productId)) &&
      (!price.catalogSizeCode ||
        price.technicalVariantIds.includes(terminal.productId)) &&
      (!commercialPageFamily[terminal.family] ||
        price.modelCode === terminal.family ||
        variant?.modelCodes?.includes(price.modelCode) ||
        variant?.modelCode === price.modelCode) &&
      (!commercialPageFamily[price.modelCode] ||
        price.modelCode === terminal.family) &&
      (!/^EDL[SH]B?(10|30)-/.test(price.modelCode) ||
        terminal.use === "return") &&
      (!/^EDL[SH]B?(20|40)-/.test(price.modelCode) ||
        terminal.use === "supply") &&
      (!terminal.family.startsWith("EDSC-") ||
        price.modelCode === terminal.family),
  );
}
function matchingPrices(
  terminal: InstalledTerminal,
  kind: EcoclimaPrice["kind"],
  catalog: EcoclimaPriceCatalog,
  plenum?: Project["plenums"][number],
) {
  const options = terminal.commercialOptions;
  const dimensions = terminalCommercialDimensions(terminal);
  const specification =
    kind === "insulated-plenum"
      ? resolveTerminalAccessorySpecification(terminal, catalog)
      : null;
  const plenumDimensions = specification?.plenum
    ? {
        ...dimensions,
        widthMm: specification.plenum.lengthMm,
        heightMm: specification.plenum.widthMm,
      }
    : null;
  const candidates =
    kind === "terminal"
      ? commercialChoicesForTerminal(terminal, catalog)
      : catalog.prices.filter(
          (price) =>
            price.kind === kind &&
            familyMatches(price.familyCode, terminal.family) &&
            (!price.technicalVariantIds.length ||
              price.technicalVariantIds.includes(terminal.productId)) &&
            (!price.catalogSizeCode ||
              price.technicalVariantIds.includes(terminal.productId)) &&
            (dimensionsMatch(price.dimensions, dimensions) ||
              (kind === "insulated-plenum" &&
                plenumDimensions &&
                dimensionsMatch(
                  price.dimensions,
                  plenumDimensions as NonNullable<typeof dimensions>,
                ))),
        );
  return candidates.filter(
    (price) =>
      (kind !== "terminal" ||
        !options?.profileCode ||
        price.modelCode === options.profileCode) &&
      (kind !== "terminal" ||
        !options?.colorCode ||
        price.colorCode === options.colorCode) &&
      (kind !== "terminal" ||
        !price.colorCode ||
        !/^RAL\d{4}$/.test(terminal.color) ||
        price.colorCode === terminal.color) &&
      (kind !== "insulated-plenum" ||
        !plenum?.model ||
        price.modelCode === plenum.model) &&
      (kind !== "insulated-plenum" ||
        !price.connectionPosition ||
        !plenum?.connectionPosition ||
        price.connectionPosition === plenum.connectionPosition),
  );
}
function uniquePrice(candidates: EcoclimaPrice[]) {
  const keys = new Set(
    candidates.map(
      (price) =>
        `${price.modelCode}|${price.colorCode ?? ""}|${price.connectionPosition ?? ""}|${price.unitPriceCents}|${JSON.stringify(price.dimensions)}|${price.catalogSizeCode ?? ""}`,
    ),
  );
  return keys.size === 1 ? candidates[0] : null;
}
export function resolveTerminalAccessorySpecification(
  terminal: InstalledTerminal,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
): TerminalAccessorySpecification | null {
  const dimensions = terminalCommercialDimensions(terminal);
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  const variant = family?.variants.find(
    (item) => item.id === terminal.productId,
  );
  const original = variant?.originalDimensionsMm;
  const alternate =
    original?.L1 && original?.H1 && dimensions
      ? {
          ...dimensions,
          widthMm: original.L1,
          heightMm: original.H1,
        }
      : null;
  const matches = catalog.accessorySpecifications.filter(
    (item) =>
      familyMatches(item.familyCode, terminal.family) &&
      (dimensionsMatch(item.dimensions, dimensions) ||
        (alternate && dimensionsMatch(item.dimensions, alternate))),
  );
  return matches.length === 1 ? matches[0] : null;
}
function priceLine(
  terminal: InstalledTerminal,
  kind: EcoclimaPrice["kind"],
  quantity: number | null,
  catalog: EcoclimaPriceCatalog,
  quantitySource: EcoclimaPrice["sourceMetadata"] | null = null,
  plenum?: Project["plenums"][number],
): EcoclimaBomLine {
  const candidates = matchingPrices(terminal, kind, catalog, plenum);
  const price = uniquePrice(candidates);
  const articleCode =
    price &&
    (officialArticles.priceArticles as Record<string, string>)[price.id];
  const article = articleCode
    ? (
        officialArticles.articles as Record<
          string,
          { code: string; description: string }
        >
      )[articleCode]
    : undefined;
  const connectionLabels = {
    lateral: "laterale",
    upper: "superiore",
    lower: "inferiore",
    rear: "posteriore",
    front: "anteriore",
    left: "sinistro",
    right: "destro",
    custom: "personalizzato",
  };
  const labels = {
    terminal: "Terminale",
    "insulated-plenum": "Plenum terminale isolato",
    "fixing-bridge": "Ponte di fissaggio",
    "continuity-kit": "Kit di continuità",
    "fixing-kit": "Kit di fissaggio",
    accessory: "Accessorio",
  };
  const unitPrice = price
    ? kind === "terminal"
      ? terminalFinishPrice(price, terminal.color)
      : price.unitPriceCents
    : null;
  const extended =
    unitPrice !== null && quantity !== null ? unitPrice * quantity : null;
  if (extended !== null && !Number.isSafeInteger(extended))
    throw new Error("Importo commerciale fuori intervallo sicuro.");
  return {
    id: `${terminal.id}:${kind}`,
    terminalIds: [terminal.id],
    systemId: terminal.systemId,
    familyCode: terminal.family,
    kind,
    label:
      article?.description ??
      (price?.label ?? `${labels[kind]} ${terminal.family}`) +
        (kind === "insulated-plenum" && plenum
          ? ` · stacco ${connectionLabels[plenum.connectionPosition ?? "lateral"]}`
          : "") +
        (kind === "terminal" && terminal.color
          ? ` · ${terminalFinishLabel(terminal.color)}`
          : ""),
    dimensions:
      kind === "terminal"
        ? terminalDimensionsText(terminal)
        : kind === "insulated-plenum" && plenum
          ? `${plenum.widthMm} × ${plenum.heightMm} × ${plenum.depthMm} mm`
          : null,
    sku: article?.code ?? null,
    quantity,
    unitPriceCents: unitPrice,
    extendedPriceCents: extended,
    currency: "EUR",
    status: extended === null ? "unknown" : "known",
    reason:
      quantity === null
        ? "Quantità richiesta non verificata nelle istruzioni del costruttore."
        : price && unitPrice === null
          ? "Verniciatura del colore scelto: prezzo da quotare a Ecoclima."
          : price
            ? article
              ? null
              : "Codice articolo e descrizione ufficiale non disponibili per questa variante: verificare con Ecoclima."
            : candidates.length
              ? "Variante commerciale ambigua: registrare modello, colore e posizione dello stacco."
              : "Prezzo di listino ufficiale non disponibile per questa misura e variante esatta. Richiedere quotazione a Ecoclima.",
    sourceMetadata: price?.sourceMetadata ?? null,
    quantitySourceMetadata: quantitySource,
  };
}
function adjacentInRun(a: InstalledTerminal, b: InstalledTerminal) {
  if (
    a.floorId !== b.floorId ||
    a.roomId !== b.roomId ||
    a.systemId !== b.systemId ||
    a.mounting !== b.mounting ||
    a.family !== b.family ||
    Math.abs(a.rotation - b.rotation) > 0.001 ||
    a.heightMm !== b.heightMm ||
    a.productId !== b.productId ||
    a.commercialOptions?.profileCode !== b.commercialOptions?.profileCode ||
    a.commercialOptions?.colorCode !== b.commercialOptions?.colorCode
  )
    return false;
  const endpoint = (item: InstalledTerminal, sign: number) => ({
    x: item.position.x + (sign * Math.cos(item.rotation) * item.widthMm) / 2000,
    y: item.position.y + (sign * Math.sin(item.rotation) * item.widthMm) / 2000,
  });
  return [-1, 1].some((signA) =>
    [-1, 1].some((signB) => {
      const p = endpoint(a, signA),
        q = endpoint(b, signB);
      return Math.hypot(p.x - q.x, p.y - q.y) <= 0.002;
    }),
  );
}

/** Prices never participate in technical sizing or product ranking. */
export function calculateEcoclimaBom(
  project: BomProject,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
): EcoclimaBom {
  const separatePlenums =
    project.plenums?.filter((p) => p.attachmentId !== undefined) ?? [];
  const terminalPlenums = new Map(
    separatePlenums.flatMap((plenum) => {
      const terminal = project.airTerminals.find(
        (item) => item.id === plenum.attachmentId,
      );
      return terminal ? [[terminal.id, plenum] as const] : [];
    }),
  );
  // Plenum di bocchetta già valorizzati nella riga del terminale.
  const pricedTerminalPlenums = new Set<string>();
  const lines: EcoclimaBomLine[] = [],
    runs = new Map<string, InstalledTerminal[]>();
  for (const terminal of project.airTerminals as InstalledTerminal[]) {
    lines.push(priceLine(terminal, "terminal", 1, catalog));
    const specification = resolveTerminalAccessorySpecification(
      terminal,
      catalog,
    );
    const separate = terminalPlenums.get(terminal.id);
    // Nessun plenum è implicito nella bocchetta: si quota solo il corpo
    // separato realmente collegato e coerente con la scheda di catalogo.
    if (separate && savedPlenumIsCatalogue(separate, specification)) {
      lines.push(
        priceLine(terminal, "insulated-plenum", 1, catalog, null, separate),
      );
      pricedTerminalPlenums.add(terminal.id);
    }
    if (
      specification?.fixingBridgeQuantity ||
      (terminal.commercialOptions?.fixingBridges !== false &&
        catalog.prices.some(
          (price) =>
            price.kind === "fixing-bridge" &&
            familyMatches(price.familyCode, terminal.family),
        ))
    ) {
      const line = priceLine(
        terminal,
        "fixing-bridge",
        specification?.fixingBridgeQuantity ?? null,
        catalog,
        specification?.fixingBridgeSourceMetadata ??
          specification?.sourceMetadata ??
          null,
      );
      if (
        terminal.commercialOptions?.fixingBridges === false &&
        specification?.fixingBridgeQuantity
      ) {
        line.status = "unknown";
        line.extendedPriceCents = null;
        line.reason =
          "Ponti richiesti dalle istruzioni di montaggio: esclusione non compatibile con una distinta completa.";
      }
      lines.push(line);
    }
    if (specification?.fixingKitQuantity)
      lines.push(
        priceLine(
          terminal,
          "fixing-kit",
          specification.fixingKitQuantity,
          catalog,
          specification.fixingKitSourceMetadata ?? specification.sourceMetadata,
        ),
      );
    const runId = terminal.commercialOptions?.linearRunId;
    if (runId) runs.set(runId, [...(runs.get(runId) ?? []), terminal]);
  }
  for (const [runId, members] of runs) {
    if (members.length < 2) continue;
    const ordered = [...members].sort(
      (a, b) =>
        (a.commercialOptions?.linearRunOrder ?? -1) -
        (b.commercialOptions?.linearRunOrder ?? -1),
    );
    const orders = ordered.map(
      (terminal) => terminal.commercialOptions?.linearRunOrder,
    );
    const valid =
      orders.every((order) => order !== undefined) &&
      new Set(orders).size === orders.length &&
      ordered.every(
        (terminal, index) =>
          resolveTerminalAccessorySpecification(terminal, catalog)
            ?.continuitySupported &&
          (index === 0 || adjacentInRun(ordered[index - 1], terminal)),
      );
    const line = priceLine(
      ordered[0],
      "continuity-kit",
      valid ? members.length - 1 : null,
      catalog,
      resolveTerminalAccessorySpecification(ordered[0], catalog)
        ?.sourceMetadata ?? null,
    );
    line.id = `run:${runId}:continuity-kit`;
    line.terminalIds = members.map((terminal) => terminal.id);
    if (!valid)
      line.reason =
        "Linea non verificata: moduli adiacenti, stessa variante, ordine univoco e giunzione ufficiale necessari.";
    if (
      members.some(
        (terminal) => terminal.commercialOptions?.continuityKit === false,
      )
    ) {
      line.status = "unknown";
      line.extendedPriceCents = null;
      line.reason =
        "Kit richiesto per la giunzione ufficiale: esclusione non compatibile con una distinta completa.";
    }
    lines.push(line);
  }
  for (const system of project.hvacSystems.filter(
    (item) =>
      item.type === "ducted" &&
      !separatePlenums.some(
        (plenum) =>
          plenum.systemId === item.id &&
          item.indoorUnits.some((unit) => unit.id === plenum.attachmentId),
      ),
  ))
    lines.push({
      id: `${system.id}:machine-plenum`,
      terminalIds: [],
      systemId: system.id,
      familyCode: "",
      kind: "machine-plenum",
      label: `Plenum di mandata macchina ${system.manufacturer}`,
      dimensions: null,
      sku: null,
      quantity: 1,
      unitPriceCents: null,
      extendedPriceCents: null,
      currency: "EUR",
      status: "unknown",
      reason:
        "Plenum macchina su misura: prezzo non pubblicato nel listino dei plenum terminali Ecoclima.",
      sourceMetadata: null,
      quantitySourceMetadata: null,
    });
  for (const plenum of separatePlenums.filter((p) => p.attachmentId)) {
    const terminal = project.airTerminals.find(
      (t) => t.id === plenum.attachmentId,
    );
    if (terminal && pricedTerminalPlenums.has(terminal.id)) continue;
    lines.push({
      id: `${plenum.id}:plenum`,
      terminalIds: terminal ? [terminal.id] : [],
      systemId: plenum.systemId,
      familyCode: terminal?.family ?? "",
      kind: terminal ? "insulated-plenum" : "machine-plenum",
      label: `Plenum ${plenum.use === "supply" ? "mandata" : "ripresa"} ${plenum.model ?? "su misura"} ${plenum.widthMm} x ${plenum.heightMm} x ${plenum.depthMm} mm`,
      dimensions: `${plenum.widthMm} × ${plenum.heightMm} × ${plenum.depthMm} mm`,
      sku: null,
      quantity: 1,
      unitPriceCents: null,
      extendedPriceCents: null,
      currency: "EUR",
      status: "unknown",
      reason:
        "Plenum configurato separatamente: quotazione da confermare sulle dimensioni e sugli stacchi scelti.",
      sourceMetadata: null,
      quantitySourceMetadata: null,
    });
  }
  const knownSubtotalCents = lines.reduce(
    (sum, line) => sum + (line.extendedPriceCents ?? 0),
    0,
  );
  if (!Number.isSafeInteger(knownSubtotalCents))
    throw new Error("Totale commerciale fuori intervallo sicuro.");
  const missingLineCount = lines.filter(
    (line) => line.status === "unknown",
  ).length;
  return {
    catalogVersion: catalog.version,
    revision: catalog.revision,
    currency: "EUR",
    taxTreatment: "not-specified-by-source",
    lines,
    knownSubtotalCents,
    totalCents: missingLineCount ? null : knownSubtotalCents,
    complete: missingLineCount === 0,
    missingLineCount,
  };
}

export type TerminalSupplyConnection = {
  terminalId: string;
  terminalPortIndex: number;
  portCount: number;
  portDiameterMm: number;
  airflowM3h: number;
  plenumModelCode: string;
  connectionPosition: "lateral" | "upper";
  publishedDimensionsMm: Record<string, number>;
  sourceMetadata: EcoclimaPrice["sourceMetadata"];
};

/** One physical branch for each published terminal-plenum inlet. */
export function terminalSupplyConnections(
  project: Pick<Project, "airTerminals">,
  systemId: string,
  catalog: EcoclimaPriceCatalog = ecoclimaPriceCatalog,
) {
  const connections: TerminalSupplyConnection[] = [];
  const issues: { terminalId: string; reason: string }[] = [];
  for (const terminal of project.airTerminals.filter(
    (item) => item.systemId === systemId && item.use === "supply",
  ) as InstalledTerminal[]) {
    const specification = resolveTerminalAccessorySpecification(
      terminal,
      catalog,
    );
    const plenum = specification?.plenum;
    if (!plenum) {
      issues.push({
        terminalId: terminal.id,
        reason:
          "Plenum e stacchi originali mancanti: scheda di catalogo da verificare.",
      });
      continue;
    }
    if (
      !Number.isFinite(terminal.requiredAirflowM3h) ||
      terminal.requiredAirflowM3h <= 0
    ) {
      issues.push({
        terminalId: terminal.id,
        reason: "Portata terminale non verificata.",
      });
      continue;
    }
    for (
      let terminalPortIndex = 0;
      terminalPortIndex < plenum.portCount;
      terminalPortIndex++
    )
      connections.push({
        terminalId: terminal.id,
        terminalPortIndex,
        portCount: plenum.portCount,
        portDiameterMm: plenum.portDiameterMm,
        airflowM3h: terminal.requiredAirflowM3h / plenum.portCount,
        plenumModelCode: plenum.modelCode,
        connectionPosition: plenum.connectionPosition,
        publishedDimensionsMm: plenum.publishedDimensionsMm,
        sourceMetadata: plenum.sourceMetadata ?? specification.sourceMetadata,
      });
  }
  return { connections, issues };
}
