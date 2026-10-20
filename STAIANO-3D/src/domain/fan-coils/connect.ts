import type { Project } from "@/schemas/project";
import { connectDraftOnPlan } from "../ducted/plan-connections";
import { connectTerminalOnPlan } from "../ducted/graphic-installation";
import { ensureFanCoilAirSystem } from "./air";

/**
 * Collega una bocchetta al ventilconvettore canalizzabile. La distribuzione
 * aeraulica nasce al primo collegamento e resta agganciata all'unità.
 */
export function connectFanCoilAirOnPlan(
  project: Project,
  terminalId: string,
  fanCoilId: string,
): Project {
  const draft = project.ductedDrafts?.find(
    (item) => item.id === terminalId && item.kind === "terminal",
  );
  const terminal = project.airTerminals.find((item) => item.id === terminalId);
  const target = draft ?? terminal;
  const fanCoil = project.fanCoils?.find((item) => item.id === fanCoilId);
  if (!target) throw new Error("Bocchetta inesistente.");
  if (!fanCoil) throw new Error("Ventilconvettore inesistente.");
  if (fanCoil.locked)
    throw new Error("Sbloccare il ventilconvettore prima di collegarlo.");
  if (target.floorId !== fanCoil.floorId)
    throw new Error(
      "Collega il ventilconvettore a una bocchetta sullo stesso piano.",
    );
  const terminalInstallation = project.installations.find(
    (item) => item.id === terminal?.installationId && item.type === "ducted",
  );
  const { project: prepared, systemId } = ensureFanCoilAirSystem(
    project,
    fanCoilId,
    draft?.installationId ?? terminalInstallation?.id,
  );
  return draft
    ? connectDraftOnPlan(prepared, terminalId, systemId)
    : connectTerminalOnPlan(prepared, terminalId, systemId);
}
