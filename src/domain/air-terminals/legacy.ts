import type { Project } from "@/schemas/project";
import type { Check } from "@/domain/validation";

type Terminal = Project["airTerminals"][number];

/** Old projects lack an auditable installation and catalog operating point. */
export function needsTerminalReconfiguration(terminal: Terminal): boolean {
  return (
    terminal.legacyUnverified ||
    terminal.mounting === "unknown" ||
    terminal.shape === "unknown" ||
    terminal.elevationM === null ||
    terminal.operatingPointIndex === null ||
    terminal.pointIndex === null ||
    terminal.unitIndex === null
  );
}

export function legacyTerminalCheck(terminal: Terminal): Check | null {
  return needsTerminalReconfiguration(terminal)
    ? {
        code: "terminalLegacy",
        status: "warning",
        entityId: terminal.id,
        message: `${terminal.productId}: terminale legacy da riconfigurare. Posizione e dati salvati conservati; montaggio, quota e punto di catalogo non verificati.`,
      }
    : null;
}
