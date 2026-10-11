import type { Project } from "@/schemas/project";
import { assignInstallationRooms } from "../installations";
import { splitCatalog } from "@/domain/catalogs/splits";
import type { SplitCatalog } from "@/domain/catalogs/split-schema";
import { positionAlongRoomWall } from "@/domain/geometry/placement";
import { footprintInsideRoom } from "@/domain/geometry/footprint";
import { sizeSplitSystems, usableSplitWall, type SplitSolution } from "./size";
export function splitSystemFromSolution(
  project: Project,
  solution: SplitSolution,
  catalog: SplitCatalog,
  existingId: string | null,
): Project["hvacSystems"][number] {
  const previous = project.hvacSystems.find((s) => s.id === existingId),
    indoorUnits = solution.assignments
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((assignment) => {
        const room = project.rooms.find((r) => r.id === assignment.roomId)!,
          unit = assignment.indoor,
          old = previous?.indoorUnits.find((u) => u.roomId === room.id),
          candidate = usableSplitWall(project, room, unit);
        if (!candidate)
          throw new Error(
            "Nessuna parete contiene l'unità interna selezionata.",
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
            ? project.walls.find((w) => w.id === old.wallId)!
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
  return {
    id: existingId ?? crypto.randomUUID(),
    type: "split",
    manufacturer: solution.combination.manufacturer,
    productId: solution.combination.id,
    roomIds: indoorUnits.map((u) => u.roomId),
    capacityW: solution.combination.coolingCapacityW,
    airflowM3h: null,
    catalogVersion: catalog.version,
    indoorUnits,
    compatibilityStatus: "verified",
    decisionOrigin: "confirmed",
    linearPlan: null,
  };
}
export function applySplitSystem(
  project: Project,
  roomIds: string[],
  manufacturer: string,
  existingId: string | null,
  preferredCombinationId?: string,
  installationId?: string,
): Project {
  project = assignInstallationRooms(project, installationId, "split", roomIds);
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
          (f) => f.id === project.rooms.find((r) => r.id === id)?.floorId,
        )?.scaleVerified,
    )
  )
    throw new Error("Configurare stanze con scala verificata.");
  if (
    !installationId &&
    project.hvacSystems.some(
      (s) =>
        s.id !== existingId && s.roomIds.some((id) => roomIds.includes(id)),
    )
  )
    throw new Error(
      "Una stanza è servita da un altro sistema. Rimuovere o modificare prima quella zona.",
    );
  const solutions = sizeSplitSystems(
    project,
    roomIds,
    manufacturer,
    splitCatalog,
  );
  const solution = preferredCombinationId
    ? solutions.find((item) => item.combination.id === preferredCombinationId)
    : solutions[0];
  if (!solution)
    throw new Error(
      "Nessuna combinazione approvata e verificabile soddisfa capacità simultanee e dimensioni delle stanze selezionate.",
    );
  const system = splitSystemFromSolution(
      project,
      solution,
      splitCatalog,
      existingId,
    ),
    others = project.hvacSystems.filter((s) => s.id !== existingId);
  const affected = new Set([
    ...roomIds,
    ...(project.hvacSystems.find((s) => s.id === existingId)?.roomIds ?? []),
  ]);
  return {
    ...project,
    hvacSystems: [
      ...others,
      {
        ...system,
        installationId:
          installationId ??
          project.hvacSystems.find((s) => s.id === existingId)?.installationId,
      },
    ],
    rooms: project.rooms.map((r) =>
      affected.has(r.id)
        ? {
            ...r,
            systemType: system.roomIds.includes(r.id)
              ? "split"
              : others.some((s) => s.roomIds.includes(r.id))
                ? r.systemType
                : project.radiators.some((d) => d.roomId === r.id)
                  ? "radiator"
                  : "none",
          }
        : r,
    ),
    catalogVersions: {
      ...project.catalogVersions,
      SPLIT: splitCatalog.version,
    },
  };
}
