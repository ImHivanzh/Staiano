import type {
  AirTerminalFamily,
  AirTerminalVariant,
} from "../catalogs/air-terminal-schema";

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
