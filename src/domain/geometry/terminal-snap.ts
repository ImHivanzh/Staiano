import type { Point, Project } from "@/schemas/project";
import {
  distance,
  pointInPolygon,
  projection,
  scale,
  subtract,
  type SnapOptions,
} from "./primitives";
import { positionAlongRoomWall, roomWallSpan } from "./placement";

export function snapTerminalPose(
  project: Project,
  id: string,
  target: Point,
  options: SnapOptions,
) {
  const item = project.airTerminals.find((t) => t.id === id);
  if (!item) throw new Error("Bocchetta inesistente.");
  const room =
    project.rooms.find(
      (r) =>
        r.floorId === item.floorId &&
        pointInPolygon(target, r.polygon) &&
        (!item.systemId ||
          project.hvacSystems.some(
            (s) => s.id === item.systemId && s.roomIds.includes(r.id),
          )),
    ) ?? project.rooms.find((r) => r.id === item.roomId)!;
  const free = {
    roomId: room.id,
    position: target,
    rotation: item.rotation,
    wallId: item.mounting === "wall" ? item.wallId : null,
    label: "Snap disattivato",
  };
  if (!options.enabled) return free;
  const depth =
    (item.mounting === "ceiling" ? item.heightMm : (item.depthMm ?? 0)) / 1000;
  const candidates = project.walls
    .filter((w) => w.floorId === item.floorId)
    .flatMap((wall) =>
      project.rooms
        .filter(
          (r) =>
            r.wallIds.includes(wall.id) &&
            (!item.systemId ||
              project.hvacSystems.some(
                (s) => s.id === item.systemId && s.roomIds.includes(r.id),
              )),
        )
        .flatMap((r) => {
          const span = roomWallSpan(r, wall);
          return span
            ? [
                {
                  wall,
                  room: r,
                  span,
                  nearest: projection(target, span.start, span.end),
                },
              ]
            : [];
        }),
    )
    .sort((a, b) => distance(target, a.nearest) - distance(target, b.nearest));
  const chosen = candidates[0];
  if (
    !chosen ||
    distance(target, chosen.nearest) >
      Math.max(options.toleranceM, depth / 2 + 0.05)
  ) {
    const position = options.grid
      ? {
          x: Math.round(target.x / options.stepM) * options.stepM,
          y: Math.round(target.y / options.stepM) * options.stepM,
        }
      : target;
    return { ...free, position, label: options.grid ? "Griglia" : "Libero" };
  }
  const { span, wall } = chosen;
  const tangent = scale(subtract(span.end, span.start), 1 / span.lengthM);
  const relative = subtract(target, span.start);
  let offset = relative.x * tangent.x + relative.y * tangent.y;
  const half = item.widthMm / 2000;
  const safeStart = half + 0.02,
    safeEnd = span.lengthM - half - 0.02;
  const reference: { offset: number; label: string }[] = [
    { offset: span.lengthM / 2, label: "Centro parete" },
    { offset: safeStart, label: "Angolo iniziale" },
    { offset: safeEnd, label: "Angolo finale" },
  ];
  for (const other of project.airTerminals.filter(
    (t) => t.id !== id && t.roomId === chosen.room.id && t.wallId === wall.id,
  )) {
    const r = subtract(other.position, span.start);
    const along = r.x * tangent.x + r.y * tangent.y;
    reference.push(
      { offset: along, label: "Allineamento altra bocchetta" },
      {
        offset: along + (other.widthMm + item.widthMm) / 2000 + options.stepM,
        label: "Distanza da altra bocchetta",
      },
      {
        offset: along - (other.widthMm + item.widthMm) / 2000 - options.stepM,
        label: "Distanza da altra bocchetta",
      },
    );
  }
  let label = "Parete";
  const snapped = reference
    .filter((v) => v.offset >= safeStart && v.offset <= safeEnd)
    .sort(
      (a, b) => Math.abs(a.offset - offset) - Math.abs(b.offset - offset),
    )[0];
  if (snapped && Math.abs(snapped.offset - offset) <= options.toleranceM) {
    offset = snapped.offset;
    label = snapped.label;
  } else if (options.grid) {
    offset = Math.round(offset / options.stepM) * options.stepM;
    label = "Distanza definita";
  }
  offset =
    safeStart <= safeEnd
      ? Math.max(safeStart, Math.min(safeEnd, offset))
      : span.lengthM / 2;
  const position = positionAlongRoomWall(chosen.room, wall, offset, depth);
  return {
    roomId: chosen.room.id,
    position,
    wallId: item.mounting === "wall" ? wall.id : null,
    rotation: Math.atan2(tangent.y, tangent.x),
    label: `${label} · ${Math.max(0, offset - half).toFixed(2)} m / ${Math.max(0, span.lengthM - offset - half).toFixed(2)} m dagli angoli`,
  };
}
