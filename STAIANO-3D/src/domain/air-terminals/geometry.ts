import type {
  AirTerminalFamily,
  AirTerminalVariant,
} from "../catalogs/air-terminal-schema";
import { airTerminalFamilyAtVersion } from "../catalogs/air-terminals";
import type { Project } from "@/schemas/project";

export function airTerminalFaceWidthMm(
  terminal: Pick<
    Project["airTerminals"][number],
    "family" | "catalogVersion" | "widthMm"
  >,
) {
  const family = airTerminalFamilyAtVersion(
    terminal.family,
    terminal.catalogVersion,
  );
  return terminal.widthMm + (family?.linearFaceLengthOffsetMm ?? 0);
}

/** EDFL / EDFL-B: profile 52 mm in the official cross-section (Ecoclima, EDFL/EDFLB product page). */
export function terminalBodyDepthMm(
  family: AirTerminalFamily | null | undefined,
  variant: AirTerminalVariant | undefined,
) {
  return (
    variant?.bodyDepthMm ??
    variant?.depthMm ??
    (family && /^EDFL(B)?-\d+$/.test(family.familyCode) ? 52 : null)
  );
}

/** Prefer the measured face; use only published nominal sizes when it is absent. */
export function terminalFaceDimensions(
  family: AirTerminalFamily,
  variant: AirTerminalVariant,
) {
  return {
    widthMm:
      variant.faceWidthMm ??
      variant.widthMm ??
      variant.nominalDiameterMm ??
      null,
    heightMm:
      variant.faceHeightMm ??
      variant.heightMm ??
      variant.nominalDiameterMm ??
      (family.isLinearPerMeter ? variant.widthMm : null),
    nominal:
      !variant.faceHeightMm ||
      (!family.isLinearPerMeter && !variant.faceWidthMm),
  };
}

export function preferredEdlsProfile(
  slotWidthMm: number | null,
  color: string,
  use: "supply" | "return" = "supply",
) {
  if (
    ![20, 30].includes(slotWidthMm ?? 0) ||
    !["RAL9005", "RAL9016"].includes(color)
  )
    return undefined;
  return `${color === "RAL9016" ? "EDLSB" : "EDLS"}${use === "supply" ? "20" : "10"}-${slotWidthMm === 20 ? "FA" : "FB"}`;
}
