import type { Point, Project } from "@/schemas/project";
import { pointInPolygon } from "./primitives";

export function placeEquipmentDraft(
  project: Project,
  roomId: string,
  position: Point,
  type: "radiator" | "fanCoil" | "split" | "vrv",
  draftId?: string,
): Project {
  const room = project.rooms.find((item) => item.id === roomId);
  if (
    !room ||
    room.conditioningExclusion ||
    room.geometryStatus !== "closed" ||
    !project.floors.some(
      (floor) => floor.id === room.floorId && floor.scaleVerified,
    ) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !pointInPolygon(position, room.polygon)
  )
    throw new Error(
      "Scegli un punto dentro un ambiente chiuso con scala verificata.",
    );
  if (draftId && !project.equipmentDrafts?.some((item) => item.id === draftId))
    throw new Error("Apparecchio da configurare non trovato.");
  const draft = {
    id: draftId ?? crypto.randomUUID(),
    roomId,
    floorId: room.floorId,
    position,
    type,
  };
  return {
    ...project,
    equipmentDrafts: draftId
      ? project.equipmentDrafts?.map((item) =>
          item.id === draftId ? draft : item,
        )
      : [...(project.equipmentDrafts ?? []), draft],
  };
}
