import type { Project } from "@/schemas/project";
import { assignInstallationRooms } from "../installations";
import { indoorRoute } from "../geometry/indoor-route";
import { linearRunMembers } from "../air-terminals/linear-run";
import { needsTerminalReconfiguration } from "../air-terminals/legacy";
import { fanCoilAirSystem } from "../fan-coils/air";

export function connectedRoomIds(project: Project, machineId: string) {
  const systemId = fanCoilAirSystem(project, machineId)?.id ?? machineId;
  return [
    ...new Set([
      ...project.airTerminals
        .filter(
          (t) => t.systemId === systemId || t.pendingMachineId === systemId,
        )
        .map((t) => t.roomId),
      ...(project.ductedDrafts ?? [])
        .filter((t) => t.kind === "terminal" && t.machineId === systemId)
        .map((t) => t.roomId),
    ]),
  ];
}

export function connectDraftOnPlan(
  project: Project,
  terminalId: string,
  machineId: string,
): Project {
  const terminal =
    project.ductedDrafts?.find(
      (t) => t.id === terminalId && t.kind === "terminal",
    ) ?? project.airTerminals.find((t) => t.id === terminalId);
  const machine = project.ductedDrafts?.find(
    (t) => t.id === machineId && t.kind === "machine",
  );
  const system = project.hvacSystems.find(
    (s) => s.id === machineId && s.type === "ducted",
  );
  const unit = machine ?? system?.indoorUnits[0];
  if (!terminal || !unit || terminal.floorId !== unit.floorId)
    throw new Error(
      "Collega una bocchetta a una macchina sullo stesso piano.",
    );
  const installationId = machine?.installationId ?? system?.installationId;
  if (!installationId)
    throw new Error(
      "Macchina senza impianto: ripristina l’impianto prima di collegare.",
    );
  const next = assignInstallationRooms(project, installationId, "ducted", [
    terminal.roomId,
  ]);
  const existing = project.airTerminals.find((t) => t.id === terminalId);
  const members = existing ? linearRunMembers(project, existing) : [];
  if (members.some((t) => t.locked))
    throw new Error("Sbloccare tutti i moduli prima di collegarli.");
  const ids = new Set(members.map((t) => t.id));
  return {
    ...next,
    airTerminals: next.airTerminals.map((t) =>
      ids.has(t.id)
        ? {
            ...t,
            installationId,
            systemId: system?.id ?? null,
            pendingMachineId: machine?.id,
            pendingSystemId: undefined,
            plenumId: null,
          }
        : t,
    ),
    ducts: next.ducts?.filter((d) => !d.terminalId || !ids.has(d.terminalId)),
    ductedDrafts: next.ductedDrafts?.map((t) =>
      t.id === terminalId ? { ...t, machineId, installationId } : t,
    ),
  };
}

export function configurationBlock(
  project: Project,
  id: string,
): string | null {
  const pumpDraft = project.heatPumpDrafts?.find((p) => p.id === id);
  const pump = project.hydronicSystems?.find((p) => p.outdoorUnit.id === id);
  if (pumpDraft || pump) {
    const targets = hydronicTargets(project, id);
    return targets.length && hydronicRoomIds(project, id).length
      ? null
      : "Collega prima i terminali alla pompa di calore e le bocchette alle unità canalizzate per determinare gli ambienti serviti.";
  }
  const draft = project.ductedDrafts?.find((t) => t.id === id);
  const system = project.hvacSystems.find(
    (s) => s.type === "ducted" && s.indoorUnits.some((u) => u.id === id),
  );
  if (draft?.kind === "machine" || system)
    return connectedRoomIds(project, system?.id ?? id).length
      ? null
      : "Collega prima le bocchette alla macchina per determinare gli ambienti serviti.";
  const terminal = project.airTerminals.find((t) => t.id === id);
  if (draft?.kind === "terminal" || terminal) {
    // Connecting a terminal that needs reconfiguration fails until it is
    // reconfigured, so it must stay reachable even before it has a machine.
    if (terminal && needsTerminalReconfiguration(terminal)) return null;
    const owner =
      draft?.machineId ?? terminal?.systemId ?? terminal?.pendingMachineId;
    return owner &&
      project.hvacSystems.some(
        (s) => s.id === owner && s.type === "ducted" && s.indoorUnits.length,
      )
      ? null
      : owner
        ? "Configura prima la macchina."
        : "Collega prima la bocchetta alla macchina, poi configura la macchina e infine la bocchetta.";
  }
  return null;
}

export function hydronicTargets(project: Project, pumpId: string) {
  const draft = project.heatPumpDrafts?.find((p) => p.id === pumpId);
  const system = project.hydronicSystems?.find(
    (p) => p.outdoorUnit.id === pumpId,
  );
  return [
    ...project.radiators,
    ...(project.fanCoils ?? []),
    ...(project.equipmentDrafts ?? []).filter((t) => t.type !== "split"),
    ...(project.ductedDrafts ?? []).filter((t) => t.kind === "machine"),
    ...project.hvacSystems
      .filter((s) => s.type === "ducted")
      .flatMap((s) => s.indoorUnits),
  ].filter((t) =>
    draft
      ? draft.terminalIds?.includes(t.id)
      : system &&
        (system.terminalIds
          ? system.terminalIds.includes(t.id)
          : system.fanCoilIds.includes(t.id) ||
            project.radiators.some(
              (r) => r.id === t.id && system.roomIds.includes(r.roomId),
            )),
  );
}

export function hydronicRoomIds(project: Project, pumpId: string) {
  return [
    ...new Set(
      hydronicTargets(project, pumpId).flatMap((target) => {
        const air = fanCoilAirSystem(project, target.id);
        if (air)
          return [
            target.roomId,
            ...connectedRoomIds(project, air.id),
          ];
        const system = project.hvacSystems.find(
          (s) =>
            s.type === "ducted" &&
            s.indoorUnits.some((u) => u.id === target.id),
        );
        return system ||
          project.ductedDrafts?.some(
            (d) => d.id === target.id && d.kind === "machine",
          )
          ? connectedRoomIds(project, system?.id ?? target.id)
          : [target.roomId];
      }),
    ),
  ];
}

export function connectHydronicOnPlan(
  project: Project,
  terminalId: string,
  pumpId: string,
): Project {
  const draft = project.heatPumpDrafts?.find((p) => p.id === pumpId);
  const system = project.hydronicSystems?.find(
    (p) => p.outdoorUnit.id === pumpId,
  );
  const target = [
    ...project.radiators,
    ...(project.fanCoils ?? []),
    ...(project.equipmentDrafts ?? []).filter((t) => t.type !== "split"),
    ...(project.ductedDrafts ?? []).filter((t) => t.kind === "machine"),
    ...project.hvacSystems
      .filter((s) => s.type === "ducted")
      .flatMap((s) => s.indoorUnits),
  ].find((t) => t.id === terminalId);
  const pump = draft ?? system?.outdoorUnit;
  if (!target || !pump || target.floorId !== pump.floorId)
    throw new Error(
      "Collega la pompa a un radiatore, ventilconvettore o unità canalizzata sullo stesso piano.",
    );
  if (("locked" in target && target.locked) || system?.outdoorUnit.locked)
    throw new Error("Sbloccare gli apparecchi prima di collegarli.");
  const ducted = project.hvacSystems.find(
    (s) =>
      s.type === "ducted" && s.indoorUnits.some((u) => u.id === terminalId),
  );
  if (ducted && !ducted.genericMachine)
    throw new Error(
      "Questa macchina a espansione diretta non è un terminale ad acqua. Inserisci un’unità canalizzata con i dati manuali del modello idronico.",
    );
  if (
    project.hydronicSystems?.some(
      (s) =>
        s.id !== system?.id &&
        (s.fanCoilIds.includes(terminalId) ||
          s.terminalIds?.includes(terminalId)),
    )
  )
    throw new Error("Terminale già collegato a un’altra pompa.");
  return {
    ...project,
    heatPumpDrafts: project.heatPumpDrafts?.map((p) => ({
      ...p,
      terminalIds:
        p.id === pumpId
          ? [...new Set([...(p.terminalIds ?? []), terminalId])]
          : p.terminalIds?.filter((id) => id !== terminalId),
    })),
    hydronicSystems: project.hydronicSystems?.map((s) =>
      s.id === system?.id
        ? {
            ...s,
            roomIds: [...new Set([...s.roomIds, target.roomId])],
            terminalIds: [
              ...new Set([
                ...hydronicTargets(project, pumpId).map((t) => t.id),
                terminalId,
              ]),
            ],
            fanCoilIds: project.fanCoils?.some((t) => t.id === terminalId)
              ? [...new Set([...s.fanCoilIds, terminalId])]
              : s.fanCoilIds,
          }
        : s,
    ),
  };
}

export function pendingConnections(project: Project) {
  const lines = [];
  for (const terminal of [
    ...(project.ductedDrafts ?? []).filter((t) => t.kind === "terminal"),
    ...project.airTerminals
      .filter((t) => t.pendingMachineId)
      .map((t) => ({ ...t, machineId: t.pendingMachineId })),
  ]) {
    if (!terminal.machineId) continue;
    const machine =
      project.ductedDrafts?.find(
        (m) => m.id === terminal.machineId && m.kind === "machine",
      ) ??
      project.hvacSystems.find((s) => s.id === terminal.machineId)
        ?.indoorUnits[0];
    if (machine)
      lines.push({
        id: terminal.id,
        floorId: terminal.floorId,
        points: indoorRoute(
          project,
          terminal.floorId,
          machine.position,
          terminal.position,
        ),
      });
  }
  for (const pump of [
    ...(project.heatPumpDrafts ?? []),
    ...(project.hydronicSystems ?? []).map((s) => ({
      ...s.outdoorUnit,
      terminalIds: s.terminalIds,
    })),
  ])
    for (const target of hydronicTargets(project, pump.id))
      if (
        !project.fanCoils?.some((c) => c.id === target.id) ||
        project.heatPumpDrafts?.some((d) => d.id === pump.id)
      )
        lines.push({
          id: `${pump.id}-${target.id}`,
          floorId: pump.floorId,
          points: [pump.position, target.position],
        });
  return lines;
}
