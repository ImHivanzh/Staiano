import type { Project, Room, Wall } from "@/schemas/project";
import { bounds, distance, samePoint } from "./primitives";
import { roomWallSpan } from "./placement";

export type DimensionMode = "internal" | "axis" | "external";

/** Axis length, independent of thickness and joins. */
export function wallAxisLength(wall: Wall): number {
  return distance(wall.start, wall.end);
}

/**
 * Wall length under the active dimension mode.
 * - axis: bare axis length;
 * - internal: axis shortened to the inner faces of the joining walls;
 * - external: axis extended to the outer faces of the joining walls.
 * A free end contributes nothing: faces cannot be inferred without a join.
 */
export function wallMeasuredLength(
  project: Project,
  wall: Wall,
  mode: DimensionMode = "internal",
): number {
  const axis = wallAxisLength(wall);
  if (axis < 1e-9) return 0;
  if (mode === "axis") return axis;
  if (mode === "internal") {
    const spans = project.rooms
      .filter(
        (r) => r.geometryStatus === "closed" && r.wallIds.includes(wall.id),
      )
      .flatMap((r) => {
        const span = roomWallSpan(r, wall);
        return span ? [span.lengthM] : [];
      });
    if (spans.length) return Math.min(...spans);
  }
  const sign = mode === "internal" ? -1 : 1;
  const direction = {
    x: (wall.end.x - wall.start.x) / axis,
    y: (wall.end.y - wall.start.y) / axis,
  };
  let delta = 0;
  for (const end of [wall.start, wall.end]) {
    let contribution = 0;
    for (const other of project.walls) {
      if (other.id === wall.id || other.floorId !== wall.floorId) continue;
      if (!samePoint(other.start, end) && !samePoint(other.end, end)) continue;
      const otherAxis = distance(other.start, other.end);
      if (otherAxis < 1e-9) continue;
      const sin = Math.abs(
        direction.x * ((other.end.y - other.start.y) / otherAxis) -
          direction.y * ((other.end.x - other.start.x) / otherAxis),
      );
      if (sin < 0.2) continue; // Collinear continuation, not a corner face.
      contribution = Math.max(contribution, other.thickness / 2 / sin);
    }
    delta += contribution;
  }
  return Math.max(0.01, axis + sign * delta);
}

/**
 * Internal-first rectangular room sides. Non-rectangular rooms return null:
 * their authoritative measures stay net area and perimeter.
 */
export function roomRectSides(
  room: Room,
): { width: number; length: number } | null {
  if (room.polygon.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const a = room.polygon[i],
      b = room.polygon[(i + 1) % 4];
    if (Math.abs(a.x - b.x) > 1e-5 && Math.abs(a.y - b.y) > 1e-5) return null;
  }
  const box = bounds(room.polygon);
  return { width: box.maxX - box.minX, length: box.maxY - box.minY };
}

/** Rectangular room sides under the dimension mode, via the bounding walls. */
export function roomMeasuredSides(
  project: Project,
  room: Room,
  mode: DimensionMode = "internal",
): { width: number; length: number } | null {
  const sides = roomRectSides(room);
  if (!sides || mode === "internal") return sides;
  const box = bounds(room.polygon);
  const walls = project.walls.filter((w) => room.wallIds.includes(w.id));
  const sideThickness = (vertical: boolean, at: number) =>
    Math.max(
      0,
      ...walls
        .filter((w) =>
          vertical
            ? Math.abs(w.start.x - w.end.x) < 1e-5 &&
              Math.abs(w.start.x - at) < Math.max(w.thickness, 0.6)
            : Math.abs(w.start.y - w.end.y) < 1e-5 &&
              Math.abs(w.start.y - at) < Math.max(w.thickness, 0.6),
        )
        .map((w) => w.thickness),
    );
  const half = mode === "axis" ? 0.5 : 1;
  return {
    width:
      sides.width +
      half * (sideThickness(true, box.minX) + sideThickness(true, box.maxX)),
    length:
      sides.length +
      half * (sideThickness(false, box.minY) + sideThickness(false, box.maxY)),
  };
}

export const DIMENSION_MODE_LABEL: Record<DimensionMode, string> = {
  internal: "Interna utile",
  axis: "Asse muro",
  external: "Esterna",
};
