import type { Project } from "@/schemas/project";
import { assignInstallationRooms } from "../installations";
import { vrvCatalog, type VrvCatalog } from "@/domain/catalogs/vrv";
import { positionAlongRoomWall } from "@/domain/geometry/placement";
import { footprintInsideRoom } from "@/domain/geometry/footprint";
import { sizeVrvSystems, usableVrvWall, type VrvSolution } from "./vrv-size";
import { withHvacOutdoorUnit } from "./outdoor";

export function vrvSystemFromSolution(
  project: Project,
  solution: VrvSolution,
  catalog: VrvCatalog,
  existingId: string | null,
): Project["hvacSystems"][number] {
  const previous = project.hvacSystems.find(
      (system) => system.id === existingId,
    ),
    indoorUnits = solution.assignments.map((assignment) => {
      const room = project.rooms.find((item) => item.id === assignment.roomId)!,
        unit = assignment.indoor,
        old = previous?.indoorUnits.find(
          (placed) => placed.roomId === room.id,
        ),
        candidate = usableVrvWall(project, room, unit);
      if (!candidate)
        throw new Error(
          "Nessuna parete contiene l'unità interna VRV selezionata.",
        );
      const preserve =
        old &&
        room.wallIds.includes(old.wallId ?? "") &&
        footprintInsideRoom(
          room,
          old.position,
          unit.widthMm / 1000,
          unit.depthMm / 1000,
          old.rotation,
        );
      const wall = preserve
          ? project.walls.find((item) => item.id === old.wallId)!
          : candidate.wall,
        span = candidate.span!;
      return {
        id: old?.id ?? crypto.randomUUID(),
        roomId: room.id,
        floorId: room.floorId,
        wallId: wall.id,
        position: preserve
          ? old.position
          : positionAlongRoomWall(
              room,
              wall,
              span.lengthM / 2,
              unit.depthMm / 1000,
            ),
        rotation: preserve
          ? old.rotation
          : Math.atan2(span.end.y - span.start.y, span.end.x - span.start.x),
        widthMm: unit.widthMm,
        heightMm: unit.heightMm,
        depthMm: unit.depthMm,
        productId: unit.id,
        catalogVersion: catalog.version,
        locked: old?.locked ?? false,
      };
    });
  return withHvacOutdoorUnit(project, {
    id: existingId ?? crypto.randomUUID(),
    type: "vrv",
    manufacturer: solution.outdoor.manufacturer,
    productId: solution.outdoor.id,
    roomIds: indoorUnits.map((unit) => unit.roomId),
    capacityW: solution.outdoor.coolingW,
    airflowM3h: null,
    catalogVersion: catalog.version,
    indoorUnits,
    compatibilityStatus: "verified",
    decisionOrigin: "confirmed",
    linearPlan: null,
    outdoorUnit: previous?.outdoorUnit ?? null,
  });
}

export function applyVrvSystem(
  project: Project,
  roomIds: string[],
  existingId: string | null,
  preferredOutdoorId?: string,
  installationId?: string,
): Project {
  project = assignInstallationRooms(project, installationId, "vrv", roomIds);
  const previousSystem = project.hvacSystems.find(
    (item) => item.id === existingId,
  );
  if (
    installationId &&
    previousSystem?.installationId &&
    previousSystem.installationId !== installationId
  )
    throw new Error("La macchina appartiene a un altro impianto.");
  if (
    project.rooms.some(
      (room) => roomIds.includes(room.id) && room.conditioningExclusion,
    )
  )
    throw new Error(
      "Riattivare la climatizzazione degli ambienti selezionati.",
    );
  if (
    roomIds.some(
      (id) =>
        !project.floors.find(
          (floor) =>
            floor.id === project.rooms.find((room) => room.id === id)?.floorId,
        )?.scaleVerified,
    )
  )
    throw new Error("Configurare stanze con scala verificata.");
  if (
    !installationId &&
    project.hvacSystems.some(
      (system) =>
        system.id !== existingId &&
        system.roomIds.some((id) => roomIds.includes(id)),
    )
  )
    throw new Error(
      "Una stanza è servita da un altro sistema. Rimuovere o modificare prima quella zona.",
    );
  const solutions = sizeVrvSystems(project, roomIds, vrvCatalog);
  const solution = preferredOutdoorId
    ? solutions.find((item) => item.outdoor.id === preferredOutdoorId)
    : solutions[0];
  if (!solution)
    throw new Error(
      "Nessun abbinamento VRV verificabile copre i fabbisogni, il rapporto di connessione e le dimensioni delle stanze selezionate.",
    );
  const system = vrvSystemFromSolution(
      project,
      solution,
      vrvCatalog,
      existingId,
    ),
    others = project.hvacSystems.filter((item) => item.id !== existingId);
  const affected = new Set([
    ...roomIds,
    ...(project.hvacSystems.find((item) => item.id === existingId)?.roomIds ??
      []),
  ]);
  return {
    ...project,
    hvacSystems: [
      ...others,
      {
        ...system,
        installationId:
          installationId ??
          project.hvacSystems.find((item) => item.id === existingId)
            ?.installationId,
      },
    ],
    rooms: project.rooms.map((room) =>
      affected.has(room.id)
        ? {
            ...room,
            systemType: system.roomIds.includes(room.id)
              ? "vrv"
              : others.some((item) => item.roomIds.includes(room.id))
                ? room.systemType
                : project.radiators.some((item) => item.roomId === room.id)
                  ? "radiator"
                  : project.fanCoils?.some((item) => item.roomId === room.id)
                    ? "fanCoil"
                    : "none",
          }
        : room,
    ),
    catalogVersions: {
      ...project.catalogVersions,
      VRV: vrvCatalog.version,
    },
  };
}
