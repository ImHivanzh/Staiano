import type {
  HvacProduct,
  DischargeConnection,
} from "@/domain/catalogs/hvac-schema";
import { hvacDischargeConnection } from "@/domain/catalogs/hvac";
import type { PlenumBranch } from "./plenum";
import type { ManualDuctedMachine } from "@/schemas/project";
export type PlenumInlet = Omit<DischargeConnection, "sourceMetadata"> & {
  sourceMetadata: DischargeConnection["sourceMetadata"] | null;
  declaredManually?: boolean;
};

/** Fabricator inputs; these values are design choices, never OEM dimensions. */
export type MachinePlenumDesignSettings = {
  edgeClearanceMm: number;
  portClearanceMm: number;
  collarLengthMm: number;
  minimumBoxDepthMm: number;
  expansionHalfAngleDeg: number;
  faceWidthMm: number | null;
};
export const DEFAULT_MACHINE_PLENUM_DESIGN: MachinePlenumDesignSettings = {
  edgeClearanceMm: 25,
  portClearanceMm: 30,
  collarLengthMm: 60,
  minimumBoxDepthMm: 300,
  expansionHalfAngleDeg: 7.5,
  faceWidthMm: null,
};
export const MACHINE_PLENUM_DESIGN_BASIS = {
  title: "Fantech · Do’s and Don’ts · fan duct connections",
  url: "https://www.fantech.com.au/Content.aspx?ContentID=L5&category=dos-and-donts",
  description:
    "Transizione centrata con angolo totale massimo15°: criterio geometrico proposto, derivato dalla guida dei collegamenti ventilatori. Applicazione al canalizzato e perdite da verificare. Margini, collari e profondità sono parametri di fabbricazione modificabili, non quote del produttore.",
};
export type MachinePlenumPort = {
  branch: PlenumBranch;
  number: number;
  diameterMm: number;
  collarLengthMm: number;
  /** Origin is centre of machine outlet; +Z follows discharge. */
  centerMm: [number, number, number];
};
export type MachinePlenumGeometry = {
  machineModel: string | null;
  status: "proposed" | "pending" | "unavailable";
  inlet: PlenumInlet | null;
  bodyWidthMm: number | null;
  bodyHeightMm: number | null;
  /** Box after transition; total length includes transition and outlet collars. */
  boxDepthMm: number | null;
  transitionDepthMm: number | null;
  totalDepthMm: number | null;
  rows: number;
  ports: MachinePlenumPort[];
  settings: MachinePlenumDesignSettings;
  issues: string[];
};
const roundUp10 = (value: number) => Math.ceil((value - 1e-8) / 10) * 10;
function validSettings(s: MachinePlenumDesignSettings) {
  return (
    Number.isFinite(s.edgeClearanceMm) &&
    s.edgeClearanceMm >= 10 &&
    s.edgeClearanceMm <= 200 &&
    Number.isFinite(s.portClearanceMm) &&
    s.portClearanceMm >= 10 &&
    s.portClearanceMm <= 300 &&
    Number.isFinite(s.collarLengthMm) &&
    s.collarLengthMm >= 20 &&
    s.collarLengthMm <= 300 &&
    Number.isFinite(s.minimumBoxDepthMm) &&
    s.minimumBoxDepthMm >= 100 &&
    s.minimumBoxDepthMm <= 2000 &&
    Number.isFinite(s.expansionHalfAngleDeg) &&
    s.expansionHalfAngleDeg >= 1 &&
    s.expansionHalfAngleDeg <= 7.5 &&
    (s.faceWidthMm === null ||
      (Number.isFinite(s.faceWidthMm) &&
        s.faceWidthMm >= 100 &&
        s.faceWidthMm <= 10000))
  );
}

/** Machine-specific, dimensioned custom fabrication proposal. No OEM plenum is inferred. */
export function machinePlenumGeometry(
  branches: readonly PlenumBranch[],
  machine: HvacProduct | null,
  override?: Partial<MachinePlenumDesignSettings>,
  manual?: ManualDuctedMachine,
  use: "supply" | "return" = "supply",
  returnConnection?: ManualDuctedMachine["returnConnection"],
  /** Ripresa: scatola sul solo raccordo dichiarato se le griglie non quotano gli stacchi. */
  allowBareInlet = false,
): MachinePlenumGeometry {
  const settings = { ...DEFAULT_MACHINE_PLENUM_DESIGN, ...override };
  const declared =
    use === "supply"
      ? manual?.dischargeConnection
      : (manual?.returnConnection ?? returnConnection);
  const inlet: PlenumInlet | null = declared
    ? {
        connectionWidthMm: declared.connectionWidthMm,
        connectionHeightMm: declared.connectionHeightMm,
        dimensionBasis: declared.dimensionBasis ?? "ductOpening",
        clearOpeningWidthMm:
          declared.clearOpeningWidthMm ??
          (declared.dimensionBasis === "flangeMountingSpan"
            ? null
            : declared.connectionWidthMm),
        clearOpeningHeightMm:
          declared.clearOpeningHeightMm ??
          (declared.dimensionBasis === "flangeMountingSpan"
            ? null
            : declared.connectionHeightMm),
        collarDepthMm: declared.collarDepthMm ?? null,
        flangeOuterWidthMm: declared.flangeOuterWidthMm ?? null,
        flangeOuterHeightMm: declared.flangeOuterHeightMm ?? null,
        holePattern: declared.holePattern
          ? {
              ...declared.holePattern,
              verticalPitchMm: declared.holePattern.verticalPitchMm ?? null,
            }
          : null,
        drawingReference: "Quote inserite dall’operatore",
        conditions:
          "Attacco dichiarato manualmente; verificare sul disegno della macchina.",
        sourceMetadata: null,
        declaredManually: true,
      }
    : use === "supply"
      ? hvacDischargeConnection(machine)
      : null;
  const result: MachinePlenumGeometry = {
    machineModel: manual?.model ?? machine?.indoorModel ?? null,
    status: "unavailable",
    inlet,
    bodyWidthMm: null,
    bodyHeightMm: null,
    boxDepthMm: null,
    transitionDepthMm: null,
    totalDepthMm: null,
    rows: 0,
    ports: [],
    settings,
    issues: [],
  };
  if (!inlet) {
    result.issues.push(
      use === "supply"
        ? "Disegno del raccordo di mandata della macchina non disponibile."
        : "Raccordo di ripresa della macchina non dichiarato: inserisci larghezza e altezza dell’attacco.",
    );
    return result;
  }
  if (!validSettings(settings)) {
    result.issues.push("Parametri geometrici del plenum fuori intervallo.");
    return result;
  }
  const valid = branches.flatMap((branch, index) =>
    (branch.geometryVerified ?? branch.verified) &&
    branch.diameterMm !== null &&
    Number.isFinite(branch.diameterMm) &&
    branch.diameterMm > 0
      ? [{ branch, number: index + 1, diameterMm: branch.diameterMm }]
      : [],
  );
  if (!valid.length) {
    if (allowBareInlet && inlet) {
      const width = roundUp10(inlet.connectionWidthMm);
      const height = roundUp10(inlet.connectionHeightMm);
      result.bodyWidthMm = width;
      result.bodyHeightMm = height;
      result.transitionDepthMm = 0;
      result.boxDepthMm = settings.minimumBoxDepthMm;
      result.totalDepthMm =
        settings.minimumBoxDepthMm + settings.collarLengthMm;
      result.status = "pending";
      result.issues.push(
        "Nessuno stacco di ripresa con diametro pubblicato: plenum quotato sul solo raccordo macchina. Diametri degli stacchi da verificare prima della fabbricazione.",
      );
      return result;
    }
    result.issues.push(
      "Configurare stacchi verificati dei terminali prima di quotare il plenum.",
    );
    return result;
  }
  if (valid.length !== branches.length)
    result.issues.push(
      "Stacchi incompleti: geometria parziale, non distinta di fabbricazione completa.",
    );
  const edge = settings.edgeClearanceMm,
    gap = settings.portClearanceMm;
  const minimumWidth = Math.max(
    inlet.connectionWidthMm,
    Math.max(...valid.map((p) => p.diameterMm)) + edge * 2,
  );
  if (settings.faceWidthMm !== null && settings.faceWidthMm < minimumWidth) {
    result.issues.push(
      `Larghezza scelta insufficiente: minimo${roundUp10(minimumWidth)}mm per macchina e collari.`,
    );
    return result;
  }
  const width = roundUp10(settings.faceWidthMm ?? minimumWidth);
  // Pack actual unequal diameters; changing count never silently changes a diameter.
  const rows: (typeof valid)[] = [];
  for (const port of valid) {
    const row = rows.at(-1);
    const occupied = row?.reduce((sum, p) => sum + p.diameterMm, 0) ?? 0;
    if (
      !row ||
      occupied + gap * row.length + port.diameterMm > width - edge * 2
    )
      rows.push([port]);
    else row.push(port);
  }
  const heights = rows.map((row) => Math.max(...row.map((p) => p.diameterMm)));
  const requiredHeight =
    heights.reduce((a, b) => a + b, 0) + gap * (rows.length - 1) + edge * 2;
  const height = roundUp10(Math.max(inlet.connectionHeightMm, requiredHeight));
  const transition = roundUp10(
    Math.max(
      (width - inlet.connectionWidthMm) / 2,
      (height - inlet.connectionHeightMm) / 2,
    ) / Math.tan((settings.expansionHalfAngleDeg * Math.PI) / 180),
  );
  const depth = roundUp10(
    Math.max(
      settings.minimumBoxDepthMm,
      Math.max(...valid.map((p) => p.diameterMm)),
    ),
  );
  const packedHeight = requiredHeight - edge * 2;
  let top = packedHeight / 2;
  rows.forEach((row, index) => {
    const rowWidth =
      row.reduce((sum, p) => sum + p.diameterMm, 0) + gap * (row.length - 1);
    let left = -rowWidth / 2;
    const y = top - heights[index] / 2;
    for (const port of row) {
      result.ports.push({
        ...port,
        collarLengthMm: settings.collarLengthMm,
        centerMm: [left + port.diameterMm / 2, y, transition + depth],
      });
      left += port.diameterMm + gap;
    }
    top -= heights[index] + gap;
  });
  result.bodyWidthMm = width;
  result.bodyHeightMm = height;
  result.transitionDepthMm = transition;
  result.boxDepthMm = depth;
  result.totalDepthMm = transition + depth + settings.collarLengthMm;
  result.rows = rows.length;
  if (inlet.dimensionBasis === "flangeMountingSpan")
    result.issues.push(
      "Daikin: raccordo sulle quote di flangia; altezza netta della luce da confermare sul componente.",
    );
  if (
    !inlet.holePattern ||
    inlet.holePattern.verticalPitchMm === null ||
    inlet.flangeOuterWidthMm === null ||
    inlet.flangeOuterHeightMm === null
  )
    result.issues.push(
      "Foratura e ingombro esterno flangia: quote mancanti da rilevare prima della costruzione.",
    );
  result.status =
    valid.length === branches.length &&
    valid.every((port) => port.branch.verified)
      ? "proposed"
      : "pending";
  return result;
}
