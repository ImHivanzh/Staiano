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
