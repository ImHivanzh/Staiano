import data from "../../../catalog-data/generated/ecoclima-terminal-finishes.json";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import type { EcoclimaPrice } from "@/domain/catalogs/ecoclima-price-schema";

/** Supplement from archived official product pages and finish notes in the price workbooks. */
export function terminalFinishSpecification(familyCode: string) {
  return data.entries.find((entry) => entry.familyCodes.includes(familyCode));
}

export function terminalFinishChoices(family: AirTerminalFamily): string[] {
  const specification = terminalFinishSpecification(family.familyCode);
  return [
    ...new Set([
      ...(family.finishes ?? []),
      ...(specification?.standardFinish ? [specification.standardFinish] : []),
      ...(specification?.whiteSurchargePercent || specification?.customRal
        ? ["RAL9016"]
        : []),
    ]),
  ];
}

export function terminalFinishLabel(value: string): string {
  if (/^RAL\s*9016$/i.test(value)) return "RAL 9016 · Bianco";
  if (/^RAL\s*9005$/i.test(value)) return "RAL 9005 · Nero";
  if (/^RAL\s*9010$/i.test(value)) return "RAL 9010 · Bianco";
  if (/anodizzat/i.test(value)) return `${value} · colore non specificato`;
  return value;
}

export function isTerminalFinishAvailable(
  family: AirTerminalFamily,
  value: string,
) {
  return (
    terminalFinishChoices(family).includes(value) ||
    (!!terminalFinishSpecification(family.familyCode)?.customRal &&
      /^RAL\d{4}$/.test(value))
  );
}

export function terminalFinishPrice(
  price: EcoclimaPrice,
  color: string,
): number | null {
  const specification =
    terminalFinishSpecification(price.modelCode) ??
    terminalFinishSpecification(price.familyCode);
  if (!color || color === price.colorCode) return price.unitPriceCents;
  if (price.colorCode) return null;
  if (color === specification?.standardFinish) return price.unitPriceCents;
  if (color === "RAL9016" && specification?.whiteSurchargePercent)
    return Math.round(
      (price.unitPriceCents * (100 + specification.whiteSurchargePercent)) /
        100,
    );
  if (specification && /^RAL\d{4}$/.test(color)) return null;
  return price.unitPriceCents;
}
