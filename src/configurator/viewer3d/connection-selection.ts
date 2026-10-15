import type { Project } from "@/schemas/project";

/** Same machine/terminal pair regardless of click order. */
export function connectionSelection(
  project: Project,
  firstId: string | undefined,
  secondId: string,
) {
  const ids = [firstId, secondId];
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
  const waterTerminal = [
    ...project.radiators,
    ...(project.fanCoils ?? []),
    ...(project.equipmentDrafts ?? []).filter((item) => item.type !== "split"),
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
