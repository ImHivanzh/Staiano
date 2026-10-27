import type { Project } from "@/schemas/project";
import { ductedMachineForDevice } from "@/domain/ducted/machine";
import { fanCoilAirSystem } from "@/domain/fan-coils/air";
import { fanCoilProductAtVersion, isDuctedFanCoil } from "@/domain/catalogs/fan-coils";

export type PlanConnection = {
  plenumId?: string;
  systemId: string;
  machineId: string;
  terminalId: string;
  /** Collegamento idronico: pompa di calore e terminale ad acqua. */
  hydronic?: true;
  /** Collegamento aeraulico: ventilconvettore canalizzabile e bocchetta. */
  fanCoilId?: string;
} | null;

/** Same machine/terminal pair regardless of click order. */
export function connectionSelection(
  project: Project,
  firstId: string | undefined,
  secondId: string,
): PlanConnection {
  const ids = [firstId, secondId];
  const plenum = project.plenums.find((p) => ids.includes(p.id));
  const owner = project.airTerminals.find((t) => t.use === "supply" && ids.includes(t.id))
    ?? project.fanCoils?.find((unit) => ids.includes(unit.id) && isDuctedFanCoil(fanCoilProductAtVersion(unit.productId, unit.catalogVersion)))
    ?? ids.map((id) => id ? ductedMachineForDevice(project, id)?.unit : undefined).find(Boolean);
  if (plenum && owner)
    return {
      plenumId: plenum.id,
      systemId: "",
      machineId: owner.id,
      terminalId: owner.id,
    };
  const system = project.hvacSystems.find(
    (item) =>
      item.type === "ducted" &&
      item.indoorUnits.some((unit) => ids.includes(unit.id)),
  );
  const terminal = project.airTerminals.find((item) => ids.includes(item.id));
  const machineDraft = project.ductedDrafts?.find(
    (item) => item.kind === "machine" && ids.includes(item.id),
  );
  const terminalDraft = project.ductedDrafts?.find(
    (item) => item.kind === "terminal" && ids.includes(item.id),
  );
  const pump =
    project.heatPumpDrafts?.find((item) => ids.includes(item.id)) ??
    project.hydronicSystems
      ?.map((item) => item.outdoorUnit)
      .find((item) => ids.includes(item.id));
  const fanCoil = project.fanCoils?.find((item) => ids.includes(item.id));
  const waterTerminal = [
    ...project.radiators,
    ...(project.fanCoils ?? []),
    ...(project.equipmentDrafts ?? []).filter(
      (item) => item.type !== "split" && item.type !== "vrv",
    ),
    ...(project.ductedDrafts ?? []).filter((item) => item.kind === "machine"),
    ...project.hvacSystems
      .filter((s) => s.type === "ducted")
      .flatMap((s) => s.indoorUnits),
  ].find((item) => ids.includes(item.id));
  if (pump && waterTerminal)
    return {
      systemId: pump.id,
      machineId: pump.id,
      terminalId: waterTerminal.id,
      hydronic: true,
    };
  // Il ventilconvettore canalizzabile è già un terminale idronico: qui si
  // collega il suo lato aria, non la pompa.
  if (fanCoil && (terminal || terminalDraft)) {
    const air = fanCoilAirSystem(project, fanCoil.id);
    return {
      systemId: air?.id ?? "",
      machineId: fanCoil.id,
      terminalId: (terminal ?? terminalDraft)!.id,
      fanCoilId: fanCoil.id,
    };
  }
  if ((system || machineDraft) && terminalDraft)
    return {
      systemId: system?.id ?? machineDraft!.id,
      machineId: system?.indoorUnits[0].id ?? machineDraft!.id,
      terminalId: terminalDraft.id,
    };
  if (machineDraft && terminal)
    return {
      systemId: machineDraft.id,
      machineId: machineDraft.id,
      terminalId: terminal.id,
    };
  return system && terminal
    ? {
        systemId: system.id,
        machineId: system.indoorUnits[0].id,
        terminalId: terminal.id,
      }
    : null;
}
