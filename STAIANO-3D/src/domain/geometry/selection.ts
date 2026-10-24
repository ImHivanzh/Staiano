import type { Point, Project, Selection } from "@/schemas/project";
import { newId, recomputeProject } from "@/domain/project";
import { add, bounds, samePoint, pointInPolygon } from "./primitives";
import { followWallTransforms } from "./follow-walls";
import { movePlacedDevice } from "./move-device";
import { overlappingPolygons } from "./rooms";
import { removeEmptiedInstallations } from "../installations";

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
    fanCoils: next.fanCoils?.map(moveRoomDevice),
    airTerminals: next.airTerminals.map(moveRoomDevice),
    ductedDrafts: next.ductedDrafts?.map((draft) =>
      roomIds.has(draft.roomId) || deviceIds.has(draft.id)
        ? { ...draft, position: add(draft.position, delta) }
        : draft,
    ),
    heatPumpDrafts: next.heatPumpDrafts?.map((draft) =>
      deviceIds.has(draft.id)
        ? { ...draft, position: add(draft.position, delta) }
        : draft,
    ),
    equipmentDrafts: next.equipmentDrafts?.map((draft) =>
      roomIds.has(draft.roomId) || deviceIds.has(draft.id)
        ? { ...draft, position: add(draft.position, delta) }
        : draft,
    ),
    plenums: next.plenums.map((pl) =>
      pl.roomId && roomIds.has(pl.roomId)
        ? { ...pl, position: add(pl.position, delta) }
        : pl,
    ),
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
      ...(project.fanCoils ?? []),
      ...project.airTerminals,
      ...project.plenums,
      ...(project.pillars ?? []),
      ...(project.hydronicSystems ?? []).map((s) => s.outdoorUnit),
      ...project.hvacSystems.flatMap((system) =>
        system.outdoorUnit ? [system.outdoorUnit] : [],
      ),
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
      outdoorUnit:
        system.outdoorUnit && deviceIds.has(system.outdoorUnit.id)
          ? null
          : system.outdoorUnit,
    }))
    .filter(
      (system) =>
        (system.roomIds.length > 0 ||
          (system.type === "ducted" && system.indoorUnits.length > 0)) &&
        (system.type !== "split" || system.indoorUnits.length > 0),
    );
  const systemIds = new Set(systems.map((system) => system.id));
  return recomputeProject(
    removeEmptiedInstallations(
      {
        ...project,
        walls: project.walls.filter((wall) => !wallIds.has(wall.id)),
        rooms: project.rooms.filter((room) => !roomIds.has(room.id)),
        radiators: project.radiators.filter(keepDevice),
        ductedDrafts: project.ductedDrafts?.filter(keepDevice).map((draft) => ({
          ...draft,
          machineId:
            draft.machineId &&
            !deviceIds.has(draft.machineId) &&
            (systemIds.has(draft.machineId) ||
              project.ductedDrafts?.some(
                (m) => m.id === draft.machineId && keepDevice(m),
              ))
              ? draft.machineId
              : undefined,
        })),
        heatPumpDrafts: project.heatPumpDrafts?.filter(
          (draft) => !deviceIds.has(draft.id),
        ),
        equipmentDrafts: project.equipmentDrafts?.filter(keepDevice),
        fanCoils: project.fanCoils?.filter(keepDevice),
        airTerminals: project.airTerminals.filter(keepDevice).map((device) => ({
          ...device,
          systemId:
            device.systemId && systemIds.has(device.systemId)
              ? device.systemId
              : null,
        })),
        plenums: project.plenums.filter(
          (pl) =>
            !deviceIds.has(pl.id) &&
            !roomIds.has(pl.roomId ?? "") &&
            (!pl.systemId || systemIds.has(pl.systemId)),
        ),
        pillars: project.pillars?.filter((c) => !deviceIds.has(c.id)),
        ducts: project.ducts?.filter((d) => !deviceIds.has(d.id)),
        hvacSystems: systems,
        hydronicSystems: project.hydronicSystems?.filter(
          (s) => !deviceIds.has(s.outdoorUnit.id),
        ),
      },
      project,
    ),
  );
}

/** Copy room metadata and its physical devices; use a free offset by default. */
export function duplicateSelection(
  project: Project,
  selection: Selection[],
  delta?: Point,
): Project {
  const { roomIds, wallIds, deviceIds } = selectedGeometry(project, selection);
  if (
    project.plenums.some((pl) => deviceIds.has(pl.id)) ||
    project.hvacSystems.some(
      (s) =>
        s.type === "ducted" && s.indoorUnits.some((u) => deviceIds.has(u.id)),
    )
  )
    throw new Error(
      "Macchina e plenum appartengono a un sistema dedicato. Duplicare la stanza/sistema per crearne un secondo indipendente.",
    );
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
  const bandMap = new Map(
    rooms.flatMap((r) =>
      (r.ceilingBands ?? []).map((b) => [b.id, newId()] as const),
    ),
  );
  const copiedRooms = rooms.map((room) => ({
    ...room,
    id: roomMap.get(room.id)!,
    name: `${room.name} — copia`,
    polygon: room.polygon.map((point) => add(point, offset)),
    centroid: add(room.centroid, offset),
    wallIds: room.wallIds.map((id) => wallMap.get(id)!),
    ceilingBands: room.ceilingBands?.map((b) => ({
      ...b,
      id: bandMap.get(b.id)!,
      wallId: wallMap.get(b.wallId)!,
    })),
    roof: room.roof
      ? { ...room.roof, ridgeWallId: wallMap.get(room.roof.ridgeWallId)! }
      : undefined,
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
    drywall:
      wall.drywall && roomMap.has(wall.drywall.roomId)
        ? { ...wall.drywall, roomId: roomMap.get(wall.drywall.roomId)! }
        : undefined,
  }));
  const allDevices = [
    ...project.radiators,
    ...(project.fanCoils ?? []),
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
      ceilingBandId: device.ceilingBandId
        ? (bandMap.get(device.ceilingBandId) ?? device.ceilingBandId)
        : undefined,
      pendingMachineId: undefined,
      systemId:
        device.systemId && roomIds.has(device.roomId)
          ? (systemMap.get(device.systemId) ?? null)
          : device.systemId,
      pendingSystemId:
        device.pendingSystemId && roomIds.has(device.roomId)
          ? systemMap.get(device.pendingSystemId)
          : device.pendingSystemId,
    }));
  const runCopies = new Map<string, string>();
  for (const terminal of copiedTerminals) {
    const runId = terminal.commercialOptions?.linearRunId;
    if (!runId) continue;
    const complete = project.airTerminals
      .filter((item) => item.commercialOptions?.linearRunId === runId)
      .every((item) => deviceMap.has(item.id));
    if (complete && !runCopies.has(runId)) runCopies.set(runId, newId());
    terminal.commercialOptions = {
      ...terminal.commercialOptions!,
      linearRunId: complete ? runCopies.get(runId) : undefined,
      linearRunOrder: complete
        ? terminal.commercialOptions?.linearRunOrder
        : undefined,
    };
  }
  const copiedPlenums = project.plenums
    .filter(
      (pl) => systemMap.has(pl.systemId ?? "") && roomMap.has(pl.roomId ?? ""),
    )
    .map((pl) => ({
      ...pl,
      id: newId(),
      systemId: systemMap.get(pl.systemId ?? "")!,
      attachmentId: pl.attachmentId
        ? deviceMap.get(pl.attachmentId)
        : pl.attachmentId,
      roomId: roomMap.get(pl.roomId!)!,
      position: add(pl.position, offset),
      locked: false,
    }));
  const plenumMap = new Map(
    project.plenums
      .filter(
        (pl) =>
          systemMap.has(pl.systemId ?? "") && roomMap.has(pl.roomId ?? ""),
      )
      .map((pl, i) => [pl.id, copiedPlenums[i].id]),
  );
  for (const t of copiedTerminals)
    t.plenumId =
      t.plenumId &&
      roomIds.has(
        project.airTerminals.find((v) => deviceMap.get(v.id) === t.id)!.roomId,
      )
        ? (plenumMap.get(t.plenumId) ?? null)
        : t.plenumId;
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
    fanCoils: [
      ...(project.fanCoils ?? []),
      ...(project.fanCoils ?? [])
        .filter(selectedDevice)
        .map((u) => ({ ...copiedRoomDevice(u), locked: false })),
    ],
    airTerminals: [...project.airTerminals, ...copiedTerminals],
    equipmentDrafts: [
      ...(project.equipmentDrafts ?? []),
      ...(project.equipmentDrafts ?? [])
        .filter((draft) => roomMap.has(draft.roomId) || deviceIds.has(draft.id))
        .map((draft) => ({
          ...draft,
          id: newId(),
          roomId: roomMap.get(draft.roomId) ?? draft.roomId,
          position: add(draft.position, offset),
        })),
    ],
    heatPumpDrafts: [
      ...(project.heatPumpDrafts ?? []),
      ...(project.heatPumpDrafts ?? [])
        .filter((draft) => deviceIds.has(draft.id))
        .map((draft) => ({
          ...draft,
          id: newId(),
          position: add(draft.position, delta),
          terminalIds: undefined,
        })),
    ],
    ductedDrafts: [
      ...(project.ductedDrafts ?? []),
      ...(project.ductedDrafts ?? [])
        .filter((draft) => roomMap.has(draft.roomId) || deviceIds.has(draft.id))
        .map((draft) => ({
          ...draft,
          id: newId(),
          roomId: roomMap.get(draft.roomId) ?? draft.roomId,
          position: add(draft.position, offset),
          machineId: undefined,
        })),
    ],
    installations: project.installations.map((item) => ({
      ...item,
      roomIds: [
        ...new Set([
          ...item.roomIds,
          ...(project.ductedDrafts ?? [])
            .filter(
              (draft) =>
                draft.installationId === item.id && roomMap.has(draft.roomId),
            )
            .map((draft) => roomMap.get(draft.roomId)!),
        ]),
      ],
    })),
    hvacSystems: [...systems, ...copiedSystems],
    plenums: [...project.plenums, ...copiedPlenums],
    pillars: [
      ...(project.pillars ?? []),
      ...(project.pillars ?? [])
        .filter(
          (c) =>
            deviceIds.has(c.id) ||
            rooms.some(
              (r) =>
                r.floorId === c.floorId &&
                pointInPolygon(c.position, r.polygon),
            ),
        )
        .map((c) => ({
          ...c,
          id: newId(),
          position: add(c.position, offset),
          locked: false,
        })),
    ],
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
