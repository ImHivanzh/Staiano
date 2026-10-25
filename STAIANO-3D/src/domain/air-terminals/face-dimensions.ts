import type {
  AirTerminalFamily,
  AirTerminalVariant,
} from "@/domain/catalogs/air-terminal-schema";
import { airTerminalFamilyAtVersion } from "@/domain/catalogs/air-terminals";
import type { Project } from "@/schemas/project";

export function modelCodeFaceDimensions(
  family: AirTerminalFamily,
  variant: AirTerminalVariant,
  modelCode: string,
) {
  const offset = family.modelCodeFaceOffsetsMm?.[modelCode];
  if (!offset || !variant.widthMm || !variant.heightMm) return null;
  const widthMm = variant.widthMm + offset.widthMm,
    heightMm = variant.heightMm + offset.heightMm;
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
}

export function applyCommercialModelFace(
  terminal: Project["airTerminals"][number],
  modelCode: string,
) {
  const family = airTerminalFamilyAtVersion(
      terminal.family,
      terminal.catalogVersion,
    ),
    variant = family?.variants.find((item) => item.id === terminal.productId),
    dimensions =
      family && variant
        ? modelCodeFaceDimensions(family, variant, modelCode)
        : null;
  return dimensions
    ? { ...terminal, ...dimensions, manualDimensions: false }
    : terminal;
}
