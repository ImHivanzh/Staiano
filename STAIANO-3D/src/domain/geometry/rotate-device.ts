import type { Project } from "@/schemas/project";
import { syncAttachedPlenums } from "../ducted/attached-plenums";
import { linearRunMembers } from "../air-terminals/linear-run";
import { editOperatorTerminal } from "../air-terminals/operator";
import { moveHydronicOutdoorUnit } from "../hydronic/apply";
import { moveHvacOutdoorUnit } from "../air-conditioning/outdoor";

export function rotateDevice90(project: Project, id: string): Project {
  const terminal = project.airTerminals.find((t) => t.id === id);
  const linked = project.plenums.find((p) => p.id === id && p.attachmentId);
  if (linked?.locked) throw new Error("Sblocca il plenum prima di ruotarlo.");
  if (linked) return rotateDevice90(project, linked.attachmentId!);
  // Un plenum della macchina non ha un proprietario diretto: ruotarlo significa
  // ruotare la macchina stessa, così corpo, etichette e stacchi restano solidali.
  const machinePlenum = project.plenums.find(
    (p) => p.id === id && p.attachmentId === undefined && p.systemId,
  );
  if (machinePlenum) {
    if (machinePlenum.locked)
      throw new Error("Sblocca il plenum prima di ruotarlo.");
    const owner = project.hvacSystems.find(
      (s) => s.id === machinePlenum.systemId && s.type === "ducted",
    )?.indoorUnits[0];
    if (owner) return rotateDevice90(project, owner.id);
  }
  const pump = project.hydronicSystems?.find((s) => s.outdoorUnit.id === id);
  if (pump)
    return moveHydronicOutdoorUnit(project, id, {
      rotation: pump.outdoorUnit.rotation + Math.PI / 2,
    });
  const outdoor = project.hvacSystems.find(
    (s) => s.outdoorUnit?.id === id,
  )?.outdoorUnit;
  if (outdoor)
    return moveHvacOutdoorUnit(project, id, {
      rotation: outdoor.rotation + Math.PI / 2,
    });
  if (terminal) {
    if (linearRunMembers(project, terminal).some((t) => t.locked))
      throw new Error("Sblocca la bocchetta prima di ruotarla.");
    return syncAttachedPlenums(
      editOperatorTerminal(project, id, {
        rotation: terminal.rotation + Math.PI / 2,
      }),
    );
  }
  const rotate = <T extends { id: string; rotation: number; locked?: boolean }>(
    item: T,
  ): T => {
    if (item.id !== id) return item;
    if (item.locked) throw new Error("Sblocca l’elemento prima di ruotarlo.");
    return { ...item, rotation: (item.rotation + Math.PI / 2) % (2 * Math.PI) };
  };
  return syncAttachedPlenums(
    {
      ...project,
      radiators: project.radiators.map(rotate),
      fanCoils: project.fanCoils?.map(rotate),
      plenums: project.plenums.map(rotate),
      pillars: project.pillars?.map(rotate),
      hvacSystems: project.hvacSystems.map((s) => ({
        ...s,
        indoorUnits: s.indoorUnits.map(rotate),
        outdoorUnit: s.outdoorUnit ? rotate(s.outdoorUnit) : s.outdoorUnit,
      })),
      hydronicSystems: project.hydronicSystems?.map((s) => ({
        ...s,
        outdoorUnit: rotate(s.outdoorUnit),
      })),
    },
    project,
  );
}
