import type { Project } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import { terminalBodyDepthMm, terminalFaceDimensions } from "./geometry";
import { modelCodeFaceDimensions } from "./face-dimensions";
import { needsTerminalReconfiguration } from "./legacy";
import { calculateEcoclimaBom, type EcoclimaBom } from "./commercial-bom";

export function airTerminalCoverage(family: AirTerminalFamily) {
  const points = family.variants.flatMap((variant) => variant.operatingPoints);
  const faces = family.variants.filter(
    (variant) =>
      (variant.faceWidthMm && variant.faceHeightMm) ||
      (family.isLinearPerMeter &&
        variant.faceHeightMm &&
        (variant.lengthMm || variant.commercialLengthsMm.length)) ||
      [variant.modelCode, ...(variant.modelCodes ?? [])].some(
        (code) => code && modelCodeFaceDimensions(family, variant, code),
      ),
  ).length;
  return {
    variants: family.variants.length,
    validPoints: points.filter((point) => point.quality === "valid").length,
    reviewPoints: points.filter((point) => point.quality === "review").length,
    acousticMissing: points.filter(
      (point) => point.noiseDbA === null && point.noiseUpperBoundDbA === null,
    ).length,
    faces,
    depths: family.variants.filter(
      (variant) => terminalBodyDepthMm(family, variant) !== null,
    ).length,
  };
}

export function terminalDataQuality(
  project: Project,
  terminal: Project["airTerminals"][number],
  bom: EcoclimaBom = calculateEcoclimaBom(project),
) {
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  const variant = family?.variants.find(
    (item) => item.id === terminal.productId,
  );
  const point =
    terminal.operatingPointIndex === null
      ? null
      : variant?.operatingPoints[terminal.operatingPointIndex];
  const lines = bom.lines.filter((line) =>
    line.terminalIds.includes(terminal.id),
  );
  return {
    performance:
      !needsTerminalReconfiguration(terminal) && point?.quality === "valid"
        ? `Punto documentato${point.noiseDbA === null && point.noiseUpperBoundDbA === null ? "; acustica non disponibile" : "; condizioni acustiche della fonte"}`
        : "Punto da verificare; nessuna prestazione certificata dal render",
    geometry:
      !family || !variant
        ? "Revisione geometrica non disponibile"
        : terminal.manualDimensions
          ? `Misure dichiarate dall’operatore${terminal.depthMm == null ? "; profondità non dichiarata" : ""}`
          : terminalFaceDimensions(family, variant).nominal
            ? `Dimensioni nominali di catalogo; ingombro reale da verificare${terminal.depthMm == null ? "; profondità non pubblicata" : ""}`
            : terminal.depthMm == null
              ? "Faccia dimensionata; profondità non pubblicata"
              : "Ingombro dimensionato; dettagli 3D illustrativi, non CAD di fabbricazione",
    price:
      lines.length && lines.every((line) => line.status === "known")
        ? "Voci del terminale quotate nella revisione del listino; disponibilità da confermare"
        : "Quotazione del terminale incompleta; importi mancanti non equivalgono a zero",
  };
}
