import type { Project, Room } from "@/schemas/project";

export type PanoramaSelection = {
  floorId?: string;
  roomId?: string;
  includeRooms?: boolean;
};

export type PanoramaView = {
  floorId: string;
  title: string;
  room?: Room;
};

/** Select floor and room renders without requiring a browser or WebGL. */
export function projectPanoramaViews(
  project: Project,
  options: PanoramaSelection = {},
): PanoramaView[] {
  const selectedRoom = options.roomId
    ? project.rooms.find((room) => room.id === options.roomId)
    : undefined;
  if (options.roomId && !selectedRoom)
    throw new Error("Ambiente per il render non disponibile.");
  const requestedFloor = options.floorId ?? selectedRoom?.floorId;
  if (
    requestedFloor &&
    !project.floors.some((floor) => floor.id === requestedFloor)
  )
    throw new Error("Piano per il render non disponibile.");
  if (selectedRoom && selectedRoom.floorId !== requestedFloor)
    throw new Error("Ambiente e piano del render non corrispondono.");

  const views: PanoramaView[] = project.floors
    .filter(
      (floor) =>
        (!requestedFloor || floor.id === requestedFloor) &&
        project.walls.some((wall) => wall.floorId === floor.id),
    )
    .map((floor) => ({
      floorId: floor.id,
      title: `${floor.name} - panoramica 3D`,
    }));
  const roomViews = selectedRoom
    ? [selectedRoom]
    : options.includeRooms
      ? project.rooms.filter(
          (room) => !requestedFloor || room.floorId === requestedFloor,
        )
      : [];
  views.push(
    ...roomViews.map((room) => ({
      floorId: room.floorId,
      title: `${room.name || "Ambiente"} - vista 3D`,
      room,
    })),
  );
  return views;
}
