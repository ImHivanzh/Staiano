import type { Point, Project } from "@/schemas/project";
import { distance, projection, pointInPolygon } from "./primitives";
import { footprintInsideRoom } from "./footprint";
import { positionAlongRoomWall, roomWallSpan } from "./placement";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
export function movePlacedDevice(
  project: Project,
  deviceId: string,
  target: Point,
): Project {
  const all = [
    ...project.radiators,
    ...project.airTerminals,
    ...project.hvacSystems.flatMap((s) => s.indoorUnits),
  ];
  const item = all.find((d) => d.id === deviceId);
  if (!item) return project;
  const terminal = project.airTerminals.find((t) => t.id === deviceId);
  if (terminal && needsTerminalReconfiguration(terminal))
    throw new Error(
      "Terminale legacy: riconfigurare il montaggio nella stanza prima di spostarlo.",
    );
  if (terminal?.mounting === "ceiling") {
    const room = project.rooms.find(
      (r) =>
        r.floorId === terminal.floorId && pointInPolygon(target, r.polygon),
    );
    if (
      !room ||
      !footprintInsideRoom(
        room,
        target,
        terminal.widthMm / 1000,
        terminal.heightMm / 1000,
        terminal.rotation,
      )
    )
      throw new Error("Il terminale non rientra nel contorno della stanza.");
    if (
      terminal.systemId &&
      !project.hvacSystems.some(
        (s) => s.id === terminal.systemId && s.roomIds.includes(room.id),
      )
    )
      throw new Error(
        "La stanza non è servita dal sistema di questo terminale.",
      );
    return {
      ...project,
      airTerminals: project.airTerminals.map((t) =>
        t.id === deviceId
          ? {
              ...t,
              roomId: room.id,
              position: target,
              elevationM: room.heightM,
              wallId: null,
            }
          : t,
      ),
    };
  }
  const candidates = project.rooms
    .filter((r) => r.floorId === item.floorId)
    .flatMap((room) =>
      project.walls
        .filter((w) => room.wallIds.includes(w.id))
        .map((wall) => ({ room, wall, span: roomWallSpan(room, wall) })),
    )
    .filter((c) => c.span && c.span.lengthM >= item.widthMm / 1000 + 0.2)
    .map((c) => ({
      ...c,
      nearest: projection(target, c.span!.start, c.span!.end),
    }))
    .sort((a, b) => distance(target, a.nearest) - distance(target, b.nearest));
  const chosen = candidates[0];
  if (!chosen)
    throw new Error(
      "Nessuna parete offre lo spazio necessario all'apparecchio.",
    );
  if (
    terminal?.systemId &&
    !project.hvacSystems.some(
      (system) =>
        system.id === terminal.systemId &&
        system.roomIds.includes(chosen.room.id),
    )
  )
    throw new Error("La stanza non è servita dal sistema di questo terminale.");
  const span = chosen.span!,
    offset = Math.max(
      item.widthMm / 2000 + 0.1,
      Math.min(
        span.lengthM - item.widthMm / 2000 - 0.1,
        distance(chosen.nearest, span.start),
      ),
    );
  const moved = {
    roomId: chosen.room.id,
    wallId: chosen.wall.id,
    position: positionAlongRoomWall(
      chosen.room,
      chosen.wall,
      offset,
      (item.depthMm ?? 0) / 1000,
    ),
    rotation: Math.atan2(span.end.y - span.start.y, span.end.x - span.start.x),
  };
  return {
    ...project,
    radiators: project.radiators.map((d) =>
      d.id === deviceId ? { ...d, ...moved } : d,
    ),
    airTerminals: project.airTerminals.map((d) =>
      d.id === deviceId ? { ...d, ...moved } : d,
    ),
    hvacSystems: project.hvacSystems.map((s) => ({
      ...s,
      indoorUnits: s.indoorUnits.map((d) =>
        d.id === deviceId ? { ...d, ...moved } : d,
      ),
    })),
  };
}
