import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import { modelCodeFaceDimensions } from "./face-dimensions";

/** Published model dimensions differ from the placed face envelope. Never infer a SKU. */
export function airTerminalModelDescription(
  family: AirTerminalFamily | null | undefined,
  productId: string,
  modelCode?: string,
): string {
  const variant = family?.variants.find((item) => item.id === productId);
  if (!family || !variant) return "Modello non verificabile nello snapshot";
  if (variant.slotCount)
    return `${family.familyCode} · ${variant.slotCount} ${variant.slotCount === 1 ? "feritoia" : "feritoie"}${variant.slotWidthMm ? ` da ${variant.slotWidthMm} mm` : ""}`;
  const diameter =
    variant.nominalDiameterMm ??
    (family.shape === "circle" ? (variant.widthMm ?? variant.heightMm) : null);
  if (diameter)
    return `${family.familyCode} · diametro nominale ${diameter} mm`;
  const selectedModelCode = modelCode ?? variant.modelCode;
  if (selectedModelCode) {
    const face =
      (modelCode && modelCodeFaceDimensions(family, variant, modelCode)) ??
      (variant.faceWidthMm && variant.faceHeightMm
        ? {
            widthMm: variant.faceWidthMm,
            heightMm: variant.faceHeightMm,
          }
        : null);
    return `${family.familyCode} · modello ${selectedModelCode}${face ? ` · fronte ${face.widthMm}×${face.heightMm} mm` : ""}`;
  }
  if (variant.widthMm && variant.heightMm)
    return `${family.familyCode} · ${variant.widthMm}×${variant.heightMm} mm nominali`;
  return family.familyCode;
}
