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
    (family && /^EDFL(B)?-\d+$/.test(family.familyCode) ? 52 : null)
  );
}
