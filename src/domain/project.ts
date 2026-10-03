import type { Point, Project, Room, Wall } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import {
  add,
  bounds,
  cross,
  distance,
  lineIntersection,
  onSegment,
  pointInPolygon,
  samePoint,
  scale,
  subtract,
} from "@/domain/geometry/primitives";
import { reconcileRooms } from "@/domain/geometry/rooms";
import { calculateThermal } from "@/domain/thermal/calculate";

export const newId = () => crypto.randomUUID();
export function createProject(name = "Nuovo progetto"): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    floors: [
      {
        id: newId(),
        name: "Piano terra",
        elevationM: 0,
        scaleVerified: true,
        background: null,
      },
    ],
    walls: [],
    rooms: [],
    openings: [],
    hvacSystems: [],
    radiators: [],
    airTerminals: [],
    projectSettings: {
      radiatorDeltaTK: 50,
      defaultHeightM: 2.7,
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.3,
      coefficientWm3: 35,
      maxNoiseDbA: 37,
    },
    catalogVersions: {},
    sourceFilesMetadata: [],
  };
}
export function recomputeProject(project: Project): Project {
  const p = structuredClone(project);
  // Materialize junctions so each boundary segment has independent identity.
  // Otherwise deleting a shared section could also delete an exterior wall.
  const expanded = new Map<string, string[]>();
  const splitWalls: Wall[] = [];
  for (const w of p.walls) {
    const cuts = [w.start, w.end];
    for (const other of p.walls) {
      if (other.id === w.id || other.floorId !== w.floorId) continue;
      const hit = lineIntersection(w.start, w.end, other.start, other.end);
      if (
        hit &&
        onSegment(hit, w.start, w.end) &&
        onSegment(hit, other.start, other.end)
      )
        cuts.push(hit);
      for (const v of [other.start, other.end])
        if (onSegment(v, w.start, w.end)) cuts.push(v);
    }
    const points = cuts
      .toSorted((a, b) => distance(a, w.start) - distance(b, w.start))
      .filter((v, i, list) => i === 0 || !samePoint(v, list[i - 1]));
    const ids: string[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const id = i === 0 ? w.id : newId();
      ids.push(id);
      const start = points[i],
        end = points[i + 1];
      if (
        !splitWalls.some(
          (v) =>
            v.floorId === w.floorId &&
            ((samePoint(v.start, start) && samePoint(v.end, end)) ||
              (samePoint(v.start, end) && samePoint(v.end, start))),
        )
      )
        splitWalls.push({ ...w, id, start, end });
    }
    expanded.set(w.id, ids);
  }
  p.walls = splitWalls;
  p.rooms = p.rooms.map((r) => ({
    ...r,
    wallIds: [...new Set(r.wallIds.flatMap((id) => expanded.get(id) ?? [id]))],
  }));
  p.rooms = p.floors.flatMap((f) =>
    reconcileRooms(p.walls, p.rooms, f.id, p.projectSettings.defaultHeightM),
  );
  // Keep associated devices when a room splits/merges, using their actual position.
  const reassociate = <
    T extends {
      floorId: string;
      roomId: string;
      position: Point;
      wallId: string | null;
    },
  >(
    items: T[],
  ) =>
    items
      .map((item) => {
        const room = p.rooms.find(
          (r) =>
            r.floorId === item.floorId &&
            pointInPolygon(item.position, r.polygon),
        );
        return {
          ...item,
          roomId: room?.id ?? item.roomId,
          wallId:
            item.wallId && p.walls.some((w) => w.id === item.wallId)
              ? item.wallId
              : null,
        };
      })
      .filter((item) => p.rooms.some((r) => r.id === item.roomId));
  p.radiators = reassociate(p.radiators);
  p.airTerminals = reassociate(p.airTerminals);
  p.openings = p.openings.filter((o) => p.walls.some((w) => w.id === o.wallId));
  p.hvacSystems = p.hvacSystems
    .map((s) => ({
      ...s,
      indoorUnits: reassociate(s.indoorUnits),
      roomIds: s.roomIds.filter((id) => p.rooms.some((r) => r.id === id)),
    }))
    .filter((s) => s.roomIds.length > 0);
  return p;
}
export function addWall(
  p: Project,
  floorId: string,
  start: Point,
  end: Point,
  type: Wall["type"] = "INTERNO",
): Project {
  if (distance(start, end) < 0.05)
    throw new Error("Il muro deve misurare almeno 5 cm.");
  const wall: Wall = {
    id: newId(),
    floorId,
    start,
    end,
    type,
    thickness:
      type === "INTERNO"
        ? p.projectSettings.internalWallThicknessM
        : p.projectSettings.externalWallThicknessM,
    height: null,
  };
  return recomputeProject({ ...p, walls: [...p.walls, wall] });
}
export function addRectangle(
  p: Project,
  floorId: string,
  input: {
    width: number;
    length: number;
    height: number;
    name: string;
    origin?: Point;
  },
): Project {
  if (
    ![input.width, input.length, input.height].every(
      (n) => Number.isFinite(n) && n >= 0.1 && n <= 100,
    )
  )
    throw new Error("Misure positive richieste, da 0,10 a 100 m.");
  if (input.height > 30) throw new Error("Altezza massima 30 m.");
  const t = p.projectSettings.externalWallThicknessM,
    existing = p.walls.filter((w) => w.floorId === floorId);
  const box = bounds(existing.flatMap((w) => [w.start, w.end]));
  const o = input.origin ?? {
    x: existing.length ? box.maxX + 1 : 0,
    y: existing.length ? box.minY : 0,
  };
  const width = input.width + t,
    length = input.length + t;
  const points = [
    o,
    { x: o.x + width, y: o.y },
    { x: o.x + width, y: o.y + length },
    { x: o.x, y: o.y + length },
  ];
  const walls: Wall[] = points.map((start, i) => ({
    id: newId(),
    floorId,
    start,
    end: points[(i + 1) % 4],
    type: "ESTERNO",
    thickness: t,
    height: null,
  }));
  const result = recomputeProject({ ...p, walls: [...p.walls, ...walls] });
  const room = result.rooms.find((r) =>
    walls.every((w) => r.wallIds.includes(w.id)),
  );
  if (!room)
    throw new Error(
      "Il rettangolo interseca muri esistenti. Scegliere un'origine libera.",
    );
  room.name = input.name.trim() || "Nuovo ambiente";
  room.heightM = input.height;
  Object.assign(room, calculateThermal(room.netAreaM2, room.heightM));
  return result;
}
export function moveWall(p: Project, wallId: string, delta: Point): Project {
  const selected = p.walls.find((w) => w.id === wallId);
  if (!selected) return p;
  const walls = p.walls.map((w) =>
    w.floorId !== selected.floorId
      ? w
      : {
          ...w,
          start:
            samePoint(w.start, selected.start) ||
            samePoint(w.start, selected.end)
              ? add(w.start, delta)
              : w.start,
          end:
            samePoint(w.end, selected.start) || samePoint(w.end, selected.end)
              ? add(w.end, delta)
              : w.end,
        },
  );
  return recomputeProject({ ...p, walls });
}
export function addAdjacentRoom(
  p: Project,
  wallId: string,
  depthM: number,
  name: string,
  heightM: number,
): Project {
  const w = p.walls.find((w) => w.id === wallId);
  const occupants = p.rooms.filter((r) => r.wallIds.includes(wallId));
  if (!w || occupants.length !== 1)
    throw new Error("Selezionare una parete esterna di una stanza.");
  if (
    ![depthM, heightM].every((v) => Number.isFinite(v) && v >= 0.1 && v <= 30)
  )
    throw new Error("Profondità e altezza da 0,10 a 30 m.");
  const direction = subtract(w.end, w.start),
    length = distance(w.start, w.end);
  const insideSign =
    cross(direction, subtract(occupants[0].centroid, w.start)) > 0 ? 1 : -1;
  const delta = scale(
    { x: -direction.y, y: direction.x },
    (-insideSign * (depthM + w.thickness)) / length,
  );
  const a = w.start,
    b = w.end,
    c = add(b, delta),
    d = add(a, delta);
  const added: Wall[] = [
    [b, c],
    [c, d],
    [d, a],
  ].map(([start, end]) => ({ ...w, id: newId(), start, end, type: "ESTERNO" }));
  const result = recomputeProject({ ...p, walls: [...p.walls, ...added] });
  const room = result.rooms.find((r) => r.wallIds.includes(added[1].id));
  if (!room || result.rooms.length !== p.rooms.length + 1)
    throw new Error("Spazio adiacente occupato o geometria non valida.");
  room.name = name || "Ambiente adiacente";
  room.heightM = heightM;
  Object.assign(room, calculateThermal(room.netAreaM2, heightM));
  return result;
}
export function resizeWall(
  p: Project,
  wallId: string,
  lengthM: number,
): Project {
  if (!Number.isFinite(lengthM) || lengthM < 0.05 || lengthM > 100)
    throw new Error("Lunghezza muro da 0,05 a 100 m.");
  const selected = p.walls.find((w) => w.id === wallId);
  if (!selected) return p;
  const end = add(
    selected.start,
    scale(
      subtract(selected.end, selected.start),
      lengthM / distance(selected.start, selected.end),
    ),
  );
  return recomputeProject({
    ...p,
    walls: p.walls.map((w) =>
      w.floorId !== selected.floorId
        ? w
        : {
            ...w,
            start: samePoint(w.start, selected.end) ? end : w.start,
            end: samePoint(w.end, selected.end) ? end : w.end,
          },
    ),
  });
}
export function resizeRectangularRoom(
  p: Project,
  roomId: string,
  width: number,
  length: number,
): Project {
  const r = p.rooms.find((r) => r.id === roomId);
  if (!r || r.polygon.length !== 4)
    throw new Error("Quote stanza disponibili per rettangoli ortogonali.");
  const box = bounds(r.polygon);
  if (
    r.polygon.some((a, i) => {
      const b = r.polygon[(i + 1) % 4];
      return Math.abs(a.x - b.x) > 1e-5 && Math.abs(a.y - b.y) > 1e-5;
    })
  )
    throw new Error("Stanza non rettangolare ortogonale.");
  if (![width, length].every((n) => Number.isFinite(n) && n >= 0.1 && n <= 100))
    throw new Error("Quote nette da 0,10 a 100 m.");
  const points = p.walls
    .filter((w) => r.wallIds.includes(w.id))
    .flatMap((w) => [w.start, w.end]);
  const axes = bounds(points),
    dx = width - (box.maxX - box.minX),
    dy = length - (box.maxY - box.minY);
  const transform = (v: Point) => ({
    x: v.x + (Math.abs(v.x - axes.maxX) < 1e-5 ? dx : 0),
    y: v.y + (Math.abs(v.y - axes.maxY) < 1e-5 ? dy : 0),
  });
  return recomputeProject({
    ...p,
    walls: p.walls.map((w) =>
      w.floorId !== r.floorId
        ? w
        : {
            ...w,
            start: points.some((v) => samePoint(v, w.start))
              ? transform(w.start)
              : w.start,
            end: points.some((v) => samePoint(v, w.end))
              ? transform(w.end)
              : w.end,
          },
    ),
  });
}
export function updateRoom(
  p: Project,
  roomId: string,
  patch: Partial<
    Pick<
      Room,
      "name" | "heightM" | "systemType" | "supplyPoints" | "returnPoints"
    >
  >,
): Project {
  return {
    ...p,
    rooms: p.rooms.map((r) => {
      if (r.id !== roomId) return r;
      const updated = { ...r, ...patch };
      return {
        ...updated,
        ...calculateThermal(updated.netAreaM2, updated.heightM),
      };
    }),
  };
}
export function mergeRooms(
  p: Project,
  firstId: string,
  secondId: string,
): Project {
  const a = p.rooms.find((r) => r.id === firstId),
    b = p.rooms.find((r) => r.id === secondId);
  if (!a || !b || a.floorId !== b.floorId)
    throw new Error("Selezionare due stanze dello stesso piano.");
  const shared = a.wallIds.filter((id) => b.wallIds.includes(id));
  if (!shared.length) throw new Error("Le stanze non condividono una parete.");
  return recomputeProject({
    ...p,
    walls: p.walls.filter((w) => !shared.includes(w.id)),
  });
}
export function duplicateProject(
  p: Project,
  name = `${p.name} — copia`,
): Project {
  const copy = structuredClone(p);
  copy.id = newId();
  copy.name = name;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  return projectSchema.parse(copy);
}
