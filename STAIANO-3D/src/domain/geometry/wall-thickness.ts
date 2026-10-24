import type { Point, Project, Room, Wall } from "@/schemas/project";
import { recomputeProject } from "@/domain/project";
import { followWallTransforms } from "./follow-walls";
import {
  add,
  area,
  centroid,
  cross,
  distance,
  perimeter,
  scale,
  subtract,
} from "./primitives";

export type WallThicknessPreset = {
  internalWallThicknessM: number;
  externalWallThicknessM: number;
};

type RoomSide = { room: Room; side: 1 | -1 };
type WallLine = { point: Point; direction: Point };
type Joint = {
  point: Point;
  incident: {
    id: string;
    end: "start" | "end";
    line: WallLine;
    shift: Point;
    /** Il muro delimita almeno una stanza chiusa: la sua faccia va rispettata. */
    anchored: boolean;
  }[];
};

const unit = (a: Point, b: Point): Point | null => {
  const length = distance(a, b);
  return length < 1e-9 ? null : scale(subtract(b, a), 1 / length);
};
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const leftNormal = (direction: Point): Point => ({
  x: -direction.y,
  y: direction.x,
});
const average = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const targetThickness = (wall: Wall, preset: WallThicknessPreset) =>
  wall.type === "ESTERNO"
    ? preset.externalWallThicknessM
    : preset.internalWallThicknessM;

/**
 * Lato della stanza rispetto all'asse del muro: +1 a sinistra della direzione,
 * -1 a destra. La faccia interna del poligono stanza dista mezzo spessore
 * dall'asse, quindi la si riconosce dalla geometria già calcolata.
 */
function roomFaceSide(room: Room, wall: Wall): 1 | -1 {
  const direction = unit(wall.start, wall.end);
  const axis = distance(wall.start, wall.end);
  if (direction && axis > 1e-9) {
    const half = wall.thickness / 2;
    let best: { side: 1 | -1; overlap: number } | null = null;
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i],
        b = room.polygon[(i + 1) % room.polygon.length];
      const offsetA = cross(direction, subtract(a, wall.start)),
        offsetB = cross(direction, subtract(b, wall.start));
      if (Math.abs(Math.abs(offsetA) - half) > 1e-4) continue;
      if (Math.abs(Math.abs(offsetB) - half) > 1e-4) continue;
      if (Math.sign(offsetA) !== Math.sign(offsetB)) continue;
      const alongA = dot(subtract(a, wall.start), direction),
        alongB = dot(subtract(b, wall.start), direction);
      const overlap =
        Math.min(axis, Math.max(alongA, alongB)) -
        Math.max(0, Math.min(alongA, alongB));
      if (overlap <= 1e-6) continue;
      if (!best || overlap > best.overlap)
        best = { side: offsetA > 0 ? 1 : -1, overlap };
    }
    if (best) return best.side;
  }
  const fallback = direction
    ? cross(direction, subtract(centroid(room.polygon), wall.start))
    : 0;
  return fallback >= 0 ? 1 : -1;
}

/** Punto della retta più vicino a quello indicato. */
function projectOntoLine(point: Point, line: WallLine): Point {
  const n = leftNormal(line.direction),
    offset = dot(subtract(point, line.point), n);
  return { x: point.x - n.x * offset, y: point.y - n.y * offset };
}

/** Punto di giunzione che meglio approssima le rette dei muri incidenti. */
function jointPoint(joint: Joint): Point {
  if (joint.incident.length === 1)
    return add(joint.point, joint.incident[0].shift);
  // Un muro che non delimita stanze (per esempio un balcone) si adatta al
  // nodo: non deve spostare la faccia interna di un ambiente.
  const anchored = joint.incident.filter((incident) => incident.anchored);
  const mean = () =>
    average(joint.incident.map(({ shift }) => add(joint.point, shift)));
  if (anchored.length === 1) return projectOntoLine(mean(), anchored[0].line);
  const lines = anchored.length >= 2 ? anchored : joint.incident;
  let a11 = 0,
    a12 = 0,
    a22 = 0,
    b1 = 0,
    b2 = 0;
  for (const { line } of lines) {
    const n = leftNormal(line.direction),
      nq = dot(n, line.point);
    a11 += n.x * n.x;
    a12 += n.x * n.y;
    a22 += n.y * n.y;
    b1 += n.x * nq;
    b2 += n.y * nq;
  }
  const determinant = a11 * a22 - a12 * a12;
  if (determinant > 1e-9)
    return {
      x: (b1 * a22 - b2 * a12) / determinant,
      y: (a11 * b2 - a12 * b1) / determinant,
    };
  // Muri collineari: resta sul primo asse, allineato al vecchio nodo.
  return projectOntoLine(mean(), lines[0].line);
}

/**
 * Aggiorna lo spessore di tutti i muri di casa in un solo comando, lasciando
 * invariate le quote interne. Gli assi vengono spostati all'esterno delle
 * stanze: i muri perimetrali crescono verso l'esterno, quelli condivisi
 * allontanano gli ambienti quanto basta a conservarne le misure nette.
 */
export function applyWallThicknessPreservingInterior(
  project: Project,
  preset: WallThicknessPreset,
): Project {
  const { internalWallThicknessM: internal, externalWallThicknessM: external } =
    preset;
  if (
    ![internal, external].every(
      (value) => Number.isFinite(value) && value >= 0.01 && value <= 2,
    )
  )
    throw new Error("Spessore muri da 10 a 2000 mm.");

  const shifts = new Map<string, Point>();
  for (const room of project.rooms)
    if (room.geometryStatus === "closed") shifts.set(room.id, { x: 0, y: 0 });
  // Un ambiente per volta: le stanze chiusesi su più piani non si incontrano.
  const roomsByFloor = new Map<string, Room[]>();
  for (const room of project.rooms) {
    if (!shifts.has(room.id)) continue;
    const list = roomsByFloor.get(room.floorId) ?? [];
    list.push(room);
    roomsByFloor.set(room.floorId, list);
  }
  const lines = new Map<
    string,
    { direction: Point; shift: Point; point: Point; anchored: boolean }
  >();
  const roomSides = new Map<string, RoomSide[]>();
  for (const [floorId, rooms] of roomsByFloor) {
    const walls = project.walls.filter((wall) => wall.floorId === floorId);
    for (const wall of walls) {
      const direction = unit(wall.start, wall.end);
      if (!direction) continue;
      const sides: RoomSide[] = [];
      for (const room of rooms)
        if (room.wallIds.includes(wall.id))
          sides.push({ room, side: roomFaceSide(room, wall) });
      roomSides.set(wall.id, sides);
    }
  }
  // Le stanze si allontanano lungo le normali dei muri condivisi finché il
  // varco fra le due facce interne non raggiunge il nuovo spessore.
  const constraints = project.walls.flatMap((wall) => {
    const sides = roomSides.get(wall.id) ?? [];
    const plus = sides.find((item) => item.side === 1),
      minus = sides.find((item) => item.side === -1),
      direction = unit(wall.start, wall.end);
    if (!plus || !minus || plus.room.id === minus.room.id || !direction)
      return [];
    return [
      {
        plus: plus.room.id,
        minus: minus.room.id,
        normal: leftNormal(direction),
        delta: targetThickness(wall, preset) - wall.thickness,
      },
    ];
  });
  // Convergenza iterativa: sufficiente anche per lunghe file di ambienti.
  for (let iteration = 0; iteration < 5000; iteration++) {
    let largest = 0;
    for (const constraint of constraints) {
      const plus = shifts.get(constraint.plus)!,
        minus = shifts.get(constraint.minus)!;
      const error =
        constraint.delta - dot(subtract(plus, minus), constraint.normal);
      if (Math.abs(error) < 1e-9) continue;
      largest = Math.max(largest, Math.abs(error));
      plus.x += (error / 2) * constraint.normal.x;
      plus.y += (error / 2) * constraint.normal.y;
      minus.x -= (error / 2) * constraint.normal.x;
      minus.y -= (error / 2) * constraint.normal.y;
    }
    if (largest < 1e-8) break;
  }
  for (const wall of project.walls) {
    const direction = unit(wall.start, wall.end);
    if (!direction) continue;
    const sides = roomSides.get(wall.id) ?? [];
    const half = (targetThickness(wall, preset) - wall.thickness) / 2;
    const adjustments = sides.map(({ room, side }) => {
      const shift = shifts.get(room.id)!;
      return {
        x: shift.x + side * direction.y * half,
        y: shift.y - side * direction.x * half,
      };
    });
    const shift = adjustments.length ? average(adjustments) : { x: 0, y: 0 };
    lines.set(wall.id, {
      direction,
      point: add(wall.start, shift),
      shift,
      anchored: sides.length > 0,
    });
  }
  // I piani possono sovrapporsi in pianta: i nodi restano separati per piano.
  const key = (wall: Wall, point: Point) =>
    `${wall.floorId}|${Math.round(point.x * 1e4)},${Math.round(point.y * 1e4)}`;
  const joints = new Map<string, Joint>();
  for (const wall of project.walls) {
    const lane = lines.get(wall.id);
    if (!lane) continue;
    for (const end of ["start", "end"] as const) {
      const jointKey = key(wall, wall[end]),
        joint = joints.get(jointKey) ?? { point: wall[end], incident: [] };
      joint.incident.push({
        id: wall.id,
        end,
        line: lane,
        shift: lane.shift,
        anchored: lane.anchored,
      });
      joints.set(jointKey, joint);
    }
  }
  const endpoints = new Map<string, Partial<Record<"start" | "end", Point>>>();
  for (const joint of joints.values()) {
    const point = jointPoint(joint);
    for (const incident of joint.incident) {
      const ends = endpoints.get(incident.id) ?? {};
      ends[incident.end] = point;
      endpoints.set(incident.id, ends);
    }
  }
  const walls = project.walls.map((wall) => {
    const thickness = targetThickness(wall, preset),
      lane = lines.get(wall.id),
      ends = endpoints.get(wall.id);
    if (!lane || !ends?.start || !ends?.end) return { ...wall, thickness };
    // Gli estremi sono i nodi condivisi: la giunzione resta chiusa.
    const newStart = ends.start,
      newEnd = ends.end,
      length = distance(newStart, newEnd);
    if (length < 0.05)
      throw new Error(
        "Spessore troppo grande per la planimetria: una parete scenderebbe sotto i 5 cm.",
      );
    const direction = unit(newStart, newEnd)!;
    if (dot(direction, lane.direction) <= 0)
      throw new Error(
        "Spessore non compatibile con la planimetria: una parete si ribalterebbe.",
      );
    return { ...wall, start: newStart, end: newEnd, thickness };
  });
  if (
    walls.some((wall) => {
      const before = project.walls.find((item) => item.id === wall.id);
      return (
        before?.locked &&
        (before.thickness !== wall.thickness ||
          before.start.x !== wall.start.x ||
          before.start.y !== wall.start.y ||
          before.end.x !== wall.end.x ||
          before.end.y !== wall.end.y)
      );
    })
  )
    throw new Error(
      "Sbloccare i muri bloccati prima di cambiare lo spessore a tutti i muri.",
    );
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const openings = project.openings.map((opening) => {
    const before = project.walls.find((wall) => wall.id === opening.wallId),
      after = byId.get(opening.wallId);
    if (!before || !after) return opening;
    const beforeDirection = unit(before.start, before.end),
      afterDirection = unit(after.start, after.end);
    if (!beforeDirection || !afterDirection) return opening;
    // L'apertura resta dove si trova rispetto alla stanza: si misura di nuovo
    // dall'inizio del muro aggiornato.
    const edge = add(before.start, scale(beforeDirection, opening.offsetM));
    const length = distance(after.start, after.end);
    if (length + 1e-9 < opening.widthM)
      throw new Error(
        "Spessore non compatibile con le aperture: una parete diventerebbe più corta dell’apertura.",
      );
    const offsetM = Math.min(
      Math.max(0, dot(subtract(edge, after.start), afterDirection)),
      length - opening.widthM,
    );
    return { ...opening, offsetM };
  });
  const next = recomputeProject({
    ...followWallTransforms(project, walls),
    openings,
    projectSettings: {
      ...project.projectSettings,
      internalWallThicknessM: internal,
      externalWallThicknessM: external,
    },
  });
  // La promessa è la quota interna: se la planimetria non la conserva, il
  // comando si annulla invece di restituire stanze diverse.
  for (const room of project.rooms) {
    if (room.geometryStatus !== "closed") continue;
    const updated = next.rooms.find(
      (item) => item.id === room.id && item.geometryStatus === "closed",
    );
    if (
      !updated ||
      Math.abs(area(updated.polygon) - area(room.polygon)) > 1e-3 ||
      Math.abs(perimeter(updated.polygon) - perimeter(room.polygon)) > 5e-3
    )
      throw new Error(
        "Lo spessore richiesto non conserva le quote interne di tutti gli ambienti. Ridurre la differenza o correggere la planimetria.",
      );
  }
  return next;
}
