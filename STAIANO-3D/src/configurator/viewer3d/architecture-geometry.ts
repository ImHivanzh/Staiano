import type { Project, Room, Wall } from "@/schemas/project";
import { distance } from "@/domain/geometry/primitives";

export type ArchitecturalOpening = Project["openings"][number] & {
  sillHeightM?: number | null;
};
export type WallOpening = {
  id: string;
  type: "door" | "window";
  left: number;
  right: number;
  bottom: number;
  top: number;
  headClipped: boolean;
};
export type WallPanel = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

/** Missing window elevation never becomes an invented floor-level opening. */
export function measuredOpenings(
  wall: Wall,
  openings: readonly ArchitecturalOpening[],
  height: number,
): WallOpening[] {
  const length = distance(wall.start, wall.end);
  return openings.flatMap((opening) => {
    if (opening.wallId !== wall.id || opening.floorId !== wall.floorId)
      return [];
    if (opening.type === "window" && opening.sillHeightM == null) return [];
    const bottom = opening.type === "door" ? 0 : opening.sillHeightM!;
    if (!Number.isFinite(bottom) || bottom < 0) return [];
    const left = Math.max(0, opening.offsetM);
    const right = Math.min(length, opening.offsetM + opening.widthM);
    const top = Math.min(height, bottom + opening.heightM);
    if (right <= left || top <= bottom) return [];
    return [
      {
        id: opening.id,
        type: opening.type,
        left,
        right,
        bottom,
        top,
        headClipped: bottom + opening.heightM > height,
      },
    ];
  });
}

/** A rectangle partition cuts actual holes without touching-hole triangulation. */
export function wallPanels(
  length: number,
  height: number,
  openings: readonly WallOpening[],
): WallPanel[] {
  if (length <= 0 || height <= 0) return [];
  const xs = [
    ...new Set([0, length, ...openings.flatMap((o) => [o.left, o.right])]),
  ]
    .filter((v) => v >= 0 && v <= length)
    .sort((a, b) => a - b);
  const ys = [
    ...new Set([0, height, ...openings.flatMap((o) => [o.bottom, o.top])]),
  ]
    .filter((v) => v >= 0 && v <= height)
    .sort((a, b) => a - b);
  const panels: WallPanel[] = [];
  for (let x = 0; x < xs.length - 1; x++)
    for (let y = 0; y < ys.length - 1; y++) {
      const cx = (xs[x] + xs[x + 1]) / 2;
      const cy = (ys[y] + ys[y + 1]) / 2;
      if (
        openings.some(
          (o) => cx > o.left && cx < o.right && cy > o.bottom && cy < o.top,
        )
      )
        continue;
      panels.push({
        left: xs[x],
        right: xs[x + 1],
        bottom: ys[y],
        top: ys[y + 1],
      });
    }
  return panels;
}

export function architecturalWallHeight(
  wall: Wall,
  rooms: readonly Room[],
  defaultHeightM: number,
) {
  return (
    wall.height ??
    (Math.max(
      0,
      ...rooms.filter((r) => r.wallIds.includes(wall.id)).map((r) => r.heightM),
    ) ||
      defaultHeightM)
  );
}

/** La controparete arriva al controsoffitto: sopra, l'intercapedine continua nel vuoto tecnico (a L). */
export function liningHeight(
  wall: Wall,
  rooms: readonly Room[],
  roomId: string,
  defaultHeightM: number,
) {
  const full = architecturalWallHeight(wall, rooms, defaultHeightM);
  const ceiling = rooms.find((r) => r.id === roomId)?.ceilingHeightM;
  return ceiling && ceiling < full ? ceiling : full;
}

/** Limit an isolated room to its own span of a longer shared wall. */
export function roomWallSpan(wall: Wall, room: Room | undefined) {
  const length = distance(wall.start, wall.end);
  if (!room || length < 1e-8) return { start: 0, end: length };
  const dx = (wall.end.x - wall.start.x) / length;
  const dy = (wall.end.y - wall.start.y) / length;
  const near = room.polygon.filter((p) => {
    const perpendicular = Math.abs(
      (p.x - wall.start.x) * dy - (p.y - wall.start.y) * dx,
    );
    return perpendicular <= wall.thickness / 2 + 0.03;
  });
  if (near.length < 2) return { start: 0, end: length };
  const projected = near.map(
    (p) => (p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy,
  );
  return {
    start: Math.max(0, Math.min(...projected) - wall.thickness / 2),
    end: Math.min(length, Math.max(...projected) + wall.thickness / 2),
  };
}
