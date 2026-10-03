import type { Point, Project, Selection } from "@/schemas/project";
import { newId, recomputeProject } from "@/domain/project";
import { add, bounds, samePoint } from "./primitives";
import { followWallTransforms } from "./follow-walls";
import { movePlacedDevice } from "./move-device";
import { overlappingPolygons } from "./rooms";

function selectedGeometry(project: Project, selection: Selection[]) {
  const roomIds = new Set(
    selection.filter((item) => item.kind === "room").map((item) => item.id),
  );
  const wallIds = new Set(
    selection.filter((item) => item.kind === "wall").map((item) => item.id),
  );
  for (const room of project.rooms.filter((room) => roomIds.has(room.id)))
    for (const id of room.wallIds) wallIds.add(id);
  const deviceIds = new Set(
    selection.filter((item) => item.kind === "device").map((item) => item.id),
  );
  return { roomIds, wallIds, deviceIds };
}
function validDelta(delta: Point) {
  if (
    ![delta.x, delta.y].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 10000,
    )
  )
    throw new Error("Spostamento non valido.");
}

/** Move shared junctions once; wall-attached devices follow wall frames. */
export function translateSelection(
  project: Project,
  selection: Selection[],
  delta: Point,
): Project {
  validDelta(delta);
  const { roomIds, wallIds, deviceIds } = selectedGeometry(project, selection);
  const selectedWalls = project.walls.filter((wall) => wallIds.has(wall.id));
  const vertices = selectedWalls.flatMap((wall) => [
    { floorId: wall.floorId, point: wall.start },
    { floorId: wall.floorId, point: wall.end },
  ]);
  const transform = (point: Point, floorId: string) =>
    vertices.some(
      (vertex) => vertex.floorId === floorId && samePoint(vertex.point, point),
    )
      ? add(point, delta)
      : point;
  let next = followWallTransforms(
    project,
    project.walls.map((wall) => ({
      ...wall,
      start: transform(wall.start, wall.floorId),
      end: transform(wall.end, wall.floorId),
    })),
  );
  const movedWallIds = new Set(
    next.walls
      .filter((wall) => {
        const before = project.walls.find((other) => other.id === wall.id)!;
        return (
          !samePoint(before.start, wall.start) ||
          !samePoint(before.end, wall.end)
        );
      })
      .map((wall) => wall.id),
  );
  const movedDevices = new Set<string>();
  const moveRoomDevice = <
    T extends {
      id: string;
      roomId: string;
      wallId: string | null;
      position: Point;
    },
  >(
    device: T,
  ): T => {
    if (device.wallId && movedWallIds.has(device.wallId)) {
      movedDevices.add(device.id);
      return device;
    }
    if (roomIds.has(device.roomId)) {
      movedDevices.add(device.id);
      return { ...device, position: add(device.position, delta) };
    }
    return device;
  };
  next = {
    ...next,
    rooms: next.rooms.map((room) =>
      roomIds.has(room.id)
        ? {
            ...room,
            polygon: room.polygon.map((point) => add(point, delta)),
            centroid: add(room.centroid, delta),
          }
        : room,
    ),
    radiators: next.radiators.map(moveRoomDevice),
    airTerminals: next.airTerminals.map(moveRoomDevice),
    hvacSystems: next.hvacSystems.map((system) => ({
      ...system,
      indoorUnits: system.indoorUnits.map(moveRoomDevice),
    })),
  };
  next = recomputeProject(next);
  for (const id of deviceIds) {
    if (movedDevices.has(id)) continue;
    const before = [
      ...project.radiators,
      ...project.airTerminals,
      ...project.hvacSystems.flatMap((system) => system.indoorUnits),
    ].find((device) => device.id === id);
    if (before) next = movePlacedDevice(next, id, add(before.position, delta));
  }
  return recomputeProject(next);
}

/** Explicit room deletion authorizes deleting its devices; deleting walls does not. */
export function removeSelection(
  project: Project,
  selection: Selection[],
): Project {
  const roomIds = new Set(
    selection.filter((item) => item.kind === "room").map((item) => item.id),
  );
  const wallIds = new Set(
    selection.filter((item) => item.kind === "wall").map((item) => item.id),
  );
  const deviceIds = new Set(
    selection.filter((item) => item.kind === "device").map((item) => item.id),
  );
  for (const room of project.rooms.filter((room) => roomIds.has(room.id)))
    for (const id of room.wallIds)
      if (
        !project.rooms.some(
          (other) => !roomIds.has(other.id) && other.wallIds.includes(id),
        )
      )
        wallIds.add(id);
  const keepDevice = <T extends { id: string; roomId: string }>(device: T) =>
    !roomIds.has(device.roomId) && !deviceIds.has(device.id);
  const systems = project.hvacSystems
    .map((system) => ({
      ...system,
      roomIds: system.roomIds.filter((id) => !roomIds.has(id)),
      indoorUnits: system.indoorUnits.filter(keepDevice),
    }))
    .filter(
      (system) =>
        system.roomIds.length > 0 &&
        (system.type !== "split" || system.indoorUnits.length > 0),
    );
  const systemIds = new Set(systems.map((system) => system.id));
  return recomputeProject({
    ...project,
    walls: project.walls.filter((wall) => !wallIds.has(wall.id)),
    rooms: project.rooms.filter((room) => !roomIds.has(room.id)),
    radiators: project.radiators.filter(keepDevice),
    airTerminals: project.airTerminals.filter(keepDevice).map((device) => ({
      ...device,
      systemId:
        device.systemId && systemIds.has(device.systemId)
          ? device.systemId
          : null,
    })),
    hvacSystems: systems,
  });
}

/** Copy room metadata and its physical devices; use a free offset by default. */
export function duplicateSelection(
  project: Project,
  selection: Selection[],
  delta?: Point,
): Project {
  const { roomIds, wallIds, deviceIds } = selectedGeometry(project, selection);
  const rooms = project.rooms.filter((room) => roomIds.has(room.id));
  if (rooms.some((room) => room.geometryStatus === "unresolved"))
    throw new Error("Chiudere il contorno prima di copiare la stanza.");
  const selectedWalls = project.walls.filter((wall) => wallIds.has(wall.id));
  const targetFloors = new Set([
    ...rooms.map((room) => room.floorId),
    ...selectedWalls.map((wall) => wall.floorId),
  ]);
  if (!delta) {
    const sourceBounds = bounds(
      selectedWalls.flatMap((wall) => [wall.start, wall.end]),
    );
    const destinationBounds = bounds(
      project.walls
        .filter((wall) => targetFloors.has(wall.floorId))
        .flatMap((wall) => [wall.start, wall.end]),
    );
    delta = selectedWalls.length
      ? { x: destinationBounds.maxX - sourceBounds.minX + 1, y: 0 }
      : { x: 1, y: 0 };
  }
  validDelta(delta);
  const offset = delta;
  const roomMap = new Map(rooms.map((room) => [room.id, newId()]));
  const wallMap = new Map(selectedWalls.map((wall) => [wall.id, newId()]));
  const copiedRooms = rooms.map((room) => ({
    ...room,
    id: roomMap.get(room.id)!,
    name: `${room.name} — copia`,
    polygon: room.polygon.map((point) => add(point, offset)),
    centroid: add(room.centroid, offset),
    wallIds: room.wallIds.map((id) => wallMap.get(id)!),
  }));
  if (
    copiedRooms.some((copy) =>
      project.rooms.some(
        (room) =>
          room.floorId === copy.floorId &&
          overlappingPolygons(copy.polygon, room.polygon),
      ),
    )
  )
    throw new Error(
      "La copia interseca una stanza esistente. Scegliere una posizione libera.",
    );
  const copiedWalls = selectedWalls.map((wall) => ({
    ...wall,
    id: wallMap.get(wall.id)!,
    start: add(wall.start, offset),
    end: add(wall.end, offset),
  }));
  const allDevices = [
    ...project.radiators,
    ...project.airTerminals,
    ...project.hvacSystems.flatMap((system) => system.indoorUnits),
  ];
  const deviceMap = new Map(
    allDevices
      .filter(
        (device) => roomIds.has(device.roomId) || deviceIds.has(device.id),
      )
      .map((device) => [device.id, newId()]),
  );
  const copiedRoomDevice = <
    T extends {
      id: string;
      roomId: string;
      wallId: string | null;
      position: Point;
    },
  >(
    device: T,
  ): T => ({
    ...device,
    id: deviceMap.get(device.id)!,
    roomId: roomMap.get(device.roomId) ?? device.roomId,
    wallId: device.wallId
      ? (wallMap.get(device.wallId) ?? device.wallId)
      : null,
    position: add(device.position, offset),
  });
  const selectedDevice = <T extends { id: string; roomId: string }>(
    device: T,
  ) => deviceMap.has(device.id);
  const systemMap = new Map(
    project.hvacSystems
      .filter((system) => system.roomIds.some((id) => roomIds.has(id)))
      .map((system) => [system.id, newId()]),
  );
  const systems = project.hvacSystems.map((system) => {
    const standaloneUnits = system.indoorUnits
      .filter((unit) => deviceIds.has(unit.id) && !roomIds.has(unit.roomId))
      .map(copiedRoomDevice);
    return standaloneUnits.length
      ? {
          ...system,
          indoorUnits: [...system.indoorUnits, ...standaloneUnits],
          compatibilityStatus: "unverifiable" as const,
        }
      : system;
  });
  const copiedSystems = project.hvacSystems
    .filter((system) => systemMap.has(system.id))
    .map((system) => ({
      ...system,
      id: systemMap.get(system.id)!,
      roomIds: system.roomIds
        .filter((id) => roomMap.has(id))
        .map((id) => roomMap.get(id)!),
      indoorUnits: system.indoorUnits
        .filter((unit) => roomIds.has(unit.roomId))
        .map(copiedRoomDevice),
      compatibilityStatus: "unverifiable" as const,
    }));
  const copiedTerminals = project.airTerminals
    .filter(selectedDevice)
    .map((device) => ({
      ...copiedRoomDevice(device),
      systemId:
        device.systemId && roomIds.has(device.roomId)
          ? (systemMap.get(device.systemId) ?? null)
          : device.systemId,
    }));
  const copiedOpenings = project.openings
    .filter((opening) => wallMap.has(opening.wallId))
    .map((opening) => ({
      ...opening,
      id: newId(),
      wallId: wallMap.get(opening.wallId)!,
    }));
  let next = recomputeProject({
    ...project,
    walls: [...project.walls, ...copiedWalls],
    rooms: [...project.rooms, ...copiedRooms],
    radiators: [
      ...project.radiators,
      ...project.radiators.filter(selectedDevice).map(copiedRoomDevice),
    ],
    airTerminals: [...project.airTerminals, ...copiedTerminals],
    hvacSystems: [...systems, ...copiedSystems],
    openings: [...project.openings, ...copiedOpenings],
  });
  for (const device of allDevices.filter(
    (device) => deviceIds.has(device.id) && !roomIds.has(device.roomId),
  ))
    next = movePlacedDevice(
      next,
      deviceMap.get(device.id)!,
      add(device.position, offset),
    );
  return recomputeProject(next);
}
