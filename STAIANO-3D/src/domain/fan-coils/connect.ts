import type { Project } from "@/schemas/project";
import { connectTerminalOnPlan } from "../ducted/graphic-installation";
import { syncAttachedPlenums } from "../ducted/attached-plenums";
import { ensureFanCoilAirSystem } from "./air";

/**
 * Collega una bocchetta di mandata solo dopo averle assegnato un plenum fisico.
 */
export function connectFanCoilAirOnPlan(
  project: Project,
  terminalId: string,
  fanCoilId: string,
): Project {
  const terminal = project.airTerminals.find((item) => item.id === terminalId);
  const fanCoil = project.fanCoils?.find((item) => item.id === fanCoilId);
  if (!terminal)
    throw new Error(
      "Configura la bocchetta e il suo plenum prima del collegamento.",
    );
  if (!fanCoil) throw new Error("Ventilconvettore inesistente.");
  if (fanCoil.locked)
    throw new Error("Sbloccare il ventilconvettore prima di collegarlo.");
  if (terminal.use !== "supply")
    throw new Error("Collega il ventilconvettore a una bocchetta di mandata.");
  if (terminal.floorId !== fanCoil.floorId)
    throw new Error(
      "Collega il ventilconvettore a una bocchetta sullo stesso piano.",
    );
  if (
    !project.plenums.some(
      (plenum) =>
        plenum.attachmentId === terminal.id && plenum.use === "supply",
    )
  )
    throw new Error(
      "Aggiungi il plenum di mandata alla bocchetta prima di collegarla al ventilconvettore.",
    );
  const { project: prepared, systemId } = ensureFanCoilAirSystem(
    project,
    fanCoilId,
    project.installations.find(
      (item) => item.id === terminal.installationId && item.type === "ducted",
    )?.id,
  );
  return syncAttachedPlenums(
    connectTerminalOnPlan(prepared, terminalId, systemId),
    project,
  );
}
