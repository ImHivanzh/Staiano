import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";

/** Published model dimensions differ from the placed face envelope. Never infer a SKU. */
export function airTerminalModelDescription(
  family: AirTerminalFamily | null | undefined,
  productId: string,
): string {
  const variant = family?.variants.find((item) => item.id === productId);
  if (!family || !variant) return "Modello non verificabile nello snapshot";
  if (variant.slotCount)
    return `${family.familyCode} · ${variant.slotCount} ${variant.slotCount === 1 ? "feritoia" : "feritoie"}${variant.slotWidthMm ? ` da ${variant.slotWidthMm} mm` : ""}`;
  if (variant.nominalDiameterMm)
    return `${family.familyCode} · diametro nominale ${variant.nominalDiameterMm} mm`;
  if (variant.widthMm && variant.heightMm)
    return `${family.familyCode} · ${variant.widthMm}×${variant.heightMm} mm nominali`;
  return family.familyCode;
}
