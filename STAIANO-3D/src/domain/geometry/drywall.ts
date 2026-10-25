import type { Project, Wall, Room } from "@/schemas/project";
import { wallSchema } from "@/schemas/project";
import { roomWallSpan } from "./placement";
import {
  distance,
  lineIntersection,
  pointInPolygon,
  onSegment,
} from "./primitives";
import { syncAttachedPlenums } from "../ducted/attached-plenums";
import { recomputeProject } from "../project";
import { airTerminalFaceWidthMm } from "@/domain/air-terminals/geometry";
import {
  drywallSideForRoom,
  drywallSides,
  withDrywallSides,
} from "./drywall-sides";

type DrywallProject = { rooms: readonly Room[]; walls: readonly Wall[] };

function rawDrywall(
  project: Pick<DrywallProject, "rooms">,
  wall: Wall,
  roomId?: string,
) {
  const settings = roomId ? drywallSideForRoom(wall, roomId) : wall.drywall;
  const room = project.rooms.find(
    (r) => r.id === settings?.roomId && r.wallIds.includes(wall.id),
  );
  const offset = settings?.offsetM;
  const span =
    room && offset !== undefined
      ? roomWallSpan(room, { ...wall, drywall: undefined })
      : null;
  if (!span || offset === undefined) return null;
  const normal = {
    x: -(span.end.y - span.start.y) / span.lengthM,
    y: (span.end.x - span.start.x) / span.lengthM,
  };
  const shift = (value: number) => ({
    start: {
      x: span.start.x + normal.x * value,
      y: span.start.y + normal.y * value,
    },
    end: { x: span.end.x + normal.x * value, y: span.end.y + normal.y * value },
  });
  return {
    reference: span,
    front: shift(Math.max(0, offset)),
    back: shift(Math.min(0, offset)),
    normal,
    depthM: Math.abs(offset),
    roomId: room!.id,
    offsetM: offset,
    joinedStart: false,
    joinedEnd: false,
  };
}

/** Mitred cavities share their corner instead of leaving a closed end or an outdoor gap. */
export function drywallGeometry(
  project: DrywallProject,
  wall: Wall,
  roomId?: string,
) {
  const result = rawDrywall(project, wall, roomId);
  if (!result) return null;
  for (const other of project.walls) {
    if (other.id === wall.id) continue;
    const adjacent = rawDrywall(project, other, result.roomId);
    if (!adjacent || adjacent.roomId !== result.roomId) continue;
    for (const end of ["start", "end"] as const) {
      if (
        ![adjacent.reference.start, adjacent.reference.end].some(
          (p) => distance(p, result.reference[end]) < 1e-5,
        )
      )
        continue;
      for (const face of ["front", "back"] as const) {
        const hit = lineIntersection(
          result[face].start,
          result[face].end,
          adjacent[face].start,
          adjacent[face].end,
        );
        if (hit) result[face][end] = hit;
      }
      if (end === "start") result.joinedStart = true;
      else result.joinedEnd = true;
    }
  }
  return {
    ...result,
    polygon: [
      result.front.start,
      result.front.end,
      result.back.end,
      result.back.start,
    ],
  };
}

export function drywallGeometries(project: DrywallProject, wall: Wall) {
  return drywallSides(wall).flatMap((side) => {
    const geometry = drywallGeometry(project, wall, side.roomId);
    return geometry ? [geometry] : [];
  });
}

export function setWallDrywall(
  project: Project,
  wallId: string,
  settings: Wall["drywall"],
  clearRoomId?: string,
): Project {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall || wall.locked) throw new Error("Seleziona una parete sbloccata.");
  const roomId = settings?.roomId ?? clearRoomId ?? wall.drywall?.roomId;
  if (
    roomId &&
    !project.rooms.some((r) => r.id === roomId && r.wallIds.includes(wallId))
  )
    throw new Error("Scegli il lato di una stanza adiacente.");
  const sides = drywallSides(wall),
    sideIndex = sides.findIndex((side) => side.roomId === roomId),
    nextSides = settings
      ? sideIndex < 0
        ? [...sides, { roomId: settings.roomId, offsetM: settings.offsetM }]
        : sides.map((side, index) =>
            index === sideIndex
              ? { roomId: settings.roomId, offsetM: settings.offsetM }
              : side,
          )
      : sides.filter((side) => side.roomId !== roomId);
  if (nextSides.length > 2)
    throw new Error("Una parete può confinare al massimo con due ambienti.");
  const nextWall = wallSchema.parse(withDrywallSides(wall, nextSides));
  const nextWalls = project.walls.map((w) => (w.id === wallId ? nextWall : w));
  const affectedRooms = new Set([
    ...drywallSides(wall).map((side) => side.roomId),
    settings?.roomId,
    clearRoomId,
  ]);
  const next = {
    ...project,
    walls: nextWalls,
    airTerminals: project.airTerminals.map((t) => {
      if (!t.wallId || !affectedRooms.has(t.roomId)) return t;
      const room = project.rooms.find((r) => r.id === t.roomId)!;
      const before = t.wallId === wallId ? roomWallSpan(room, wall) : null,
        after = t.wallId === wallId ? roomWallSpan(room, nextWall) : null;
      const position =
        before && after
          ? {
              x: t.position.x + after.start.x - before.start.x,
              y: t.position.y + after.start.y - before.start.y,
            }
          : t.position;
      const owner = nextWalls.find((w) => w.id === t.wallId)!;
      const front = drywallSideForRoom(owner, room.id)
        ? drywallGeometry({ ...project, walls: nextWalls }, owner, room.id)
            ?.front
        : roomWallSpan(room, owner);
      if (!front) return { ...t, position };
      const length = distance(front.start, front.end),
        margin = airTerminalFaceWidthMm(t) / 2000 + 0.02;
      if (length < margin * 2)
        throw new Error(
          "Il fronte in cartongesso non ha spazio per la bocchetta esistente.",
        );
      const tangent = {
        x: (front.end.x - front.start.x) / length,
        y: (front.end.y - front.start.y) / length,
      };
      const along =
        (position.x - front.start.x) * tangent.x +
        (position.y - front.start.y) * tangent.y;
      const shift = Math.max(margin, Math.min(length - margin, along)) - along;
      return {
        ...t,
        position: {
          x: position.x + tangent.x * shift,
          y: position.y + tangent.y * shift,
        },
      };
    }),
  };
  if (settings && settings.offsetM > 0) {
    const room = next.rooms.find((r) => r.id === settings.roomId)!;
    for (const candidate of next.walls.filter(
      (w) => (drywallSideForRoom(w, room.id)?.offsetM ?? 0) > 0,
    )) {
      const geometry = drywallGeometry(next, candidate, room.id)!;
      if (
        [geometry.front.start, geometry.front.end].some(
          (p) =>
            !pointInPolygon(p, room.polygon) &&
            !room.polygon.some((q, i) =>
              onSegment(p, q, room.polygon[(i + 1) % room.polygon.length]),
            ),
        ) ||
        (geometry.front.end.x - geometry.front.start.x) *
          (geometry.reference.end.x - geometry.reference.start.x) +
          (geometry.front.end.y - geometry.front.start.y) *
            (geometry.reference.end.y - geometry.reference.start.y) <=
          0
      )
        throw new Error(
          "Il rientro del cartongesso supera lo spazio della stanza.",
        );
    }
  }
  return syncAttachedPlenums(recomputeProject(next), project);
}
