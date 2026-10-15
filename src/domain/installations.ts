import type { Project, Room } from "@/schemas/project";
export type Installation = Project["installations"][number];
export const installationLabels: Record<Installation["type"], string> = {
  radiator: "Radiatori",
  ducted: "Canalizzato",
  split: "Split",
  fanCoil: "Ventilconvettori",
};

export function installationRoom(
  project: Project,
  room: Room,
  installationId?: string,
): Room {
  const points = project.installations.find(
    (item) => item.id === installationId,
  )?.roomAirPoints?.[room.id];
  return points
    ? { ...room, supplyPoints: points.supply, returnPoints: points.return }
    : room;
}

export function ensureInstallations(project: Project): Project {
  const installations = (project.installations ?? [])
    .map((item) => ({
      ...item,
      roomIds: item.roomIds.filter((id) =>
        project.rooms.some((room) => room.id === id),
      ),
    }))
    .filter((item) => item.roomIds.length);
  const assign = (
    id: string | undefined,
    fallback: string,
    type: Installation["type"],
    roomIds: string[],
    name?: string,
  ) => {
    const installationId = id ?? fallback;
    let installation = installations.find((item) => item.id === installationId);
    if (!installation) {
      installation = {
        id: installationId,
        name: name || `Impianto ${installations.length + 1}`,
        type,
        roomIds: [],
      };
      installations.push(installation);
    }
    installation.roomIds = [...new Set([...installation.roomIds, ...roomIds])];
    return installationId;
  };
  return {
    ...project,
    installations,
    hvacSystems: project.hvacSystems.map((system) => ({
      ...system,
      installationId: assign(
        system.installationId,
        `installation-${system.id}`,
        system.type,
        system.roomIds,
        system.name,
      ),
    })),
    radiators: project.radiators.map((device) => ({
      ...device,
      installationId: assign(
        device.installationId,
        `radiators-${device.roomId}`,
        "radiator",
        [device.roomId],
      ),
    })),
    fanCoils: project.fanCoils?.map((device) => ({
      ...device,
      installationId: assign(
        device.installationId,
        `fan-coils-${device.roomId}`,
        "fanCoil",
        [device.roomId],
      ),
    })),
  };
}

export function createInstallation(
  project: Project,
  type: Installation["type"],
  roomId: string,
): Project {
  if (!project.rooms.some((room) => room.id === roomId))
    throw new Error("Stanza inesistente.");
  const current = ensureInstallations(project);
  return {
    ...current,
    installations: [
      ...current.installations,
      {
        id: crypto.randomUUID(),
        name: `Impianto ${current.installations.length + 1}`,
        type,
        roomIds: [roomId],
      },
    ],
  };
}

export function removeInstallation(
  project: Project,
  installationId: string,
): Project {
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  if (!installation) return project;
  const systemIds = new Set(
    project.hvacSystems
      .filter((system) => system.installationId === installationId)
      .map((system) => system.id),
  );
  const next = {
    ...project,
    installations: project.installations.filter(
      (item) => item.id !== installationId,
    ),
    hvacSystems: project.hvacSystems.filter(
      (system) => !systemIds.has(system.id),
    ),
    ductedDrafts: project.ductedDrafts?.filter(
      (draft) => draft.installationId !== installationId,
    ),
    radiators: project.radiators.filter(
      (device) => device.installationId !== installationId,
    ),
    fanCoils: project.fanCoils?.filter(
      (device) => device.installationId !== installationId,
    ),
    airTerminals: project.airTerminals.filter(
      (device) =>
        device.installationId !== installationId &&
        (!device.systemId || !systemIds.has(device.systemId)) &&
        (!device.pendingSystemId || !systemIds.has(device.pendingSystemId)),
    ),
    plenums: project.plenums.filter(
      (device) => !systemIds.has(device.systemId),
    ),
    ducts: project.ducts?.filter((device) => !systemIds.has(device.systemId)),
  };
  return {
    ...next,
    hydronicSystems: next.hydronicSystems?.map((system) => ({
      ...system,
      fanCoilIds: system.fanCoilIds.filter((id) =>
        next.fanCoils?.some((device) => device.id === id),
      ),
      pipeWaypoints: system.pipeWaypoints?.filter((route) =>
        next.fanCoils?.some((device) => device.id === route.fanCoilId),
      ),
    })),
    rooms: next.rooms.map((room) =>
      installation.roomIds.includes(room.id)
        ? {
            ...room,
            systemType:
              next.hvacSystems.find((system) =>
                system.roomIds.includes(room.id),
              )?.type ??
              (next.radiators.some((device) => device.roomId === room.id)
                ? "radiator"
                : next.fanCoils?.some((device) => device.roomId === room.id)
                  ? "fanCoil"
                  : (next.installations.find((item) =>
                      item.roomIds.includes(room.id),
                    )?.type ?? "none")),
          }
        : room,
    ),
  };
}

export function assignInstallationRooms(
  project: Project,
  installationId: string | undefined,
  type: Installation["type"],
  roomIds: string[],
): Project {
  if (!installationId) return project;
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  if (!installation || installation.type !== type)
    throw new Error(
      "Ogni impianto può contenere un solo tipo di apparecchi. Crea un altro impianto.",
    );
  if (roomIds.some((id) => !project.rooms.some((room) => room.id === id)))
    throw new Error("Stanza inesistente.");
  return {
    ...project,
    installations: project.installations.map((item) =>
      item.id === installationId
        ? { ...item, roomIds: [...new Set([...item.roomIds, ...roomIds])] }
        : item,
    ),
  };
}
