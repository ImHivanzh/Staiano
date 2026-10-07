import type { Point, Project, Room } from "@/schemas/project";
import type { FanCoilProduct } from "@/domain/catalogs/fan-coils";
import { footprintCorners } from "@/domain/geometry/footprint";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { bounds, distance, projection } from "@/domain/geometry/primitives";
import {
  deviceEnvelopeInsideRoom,
  deviceEnvelopesOverlap,
  projectDeviceEnvelopes,
  type DeviceEnvelope,
} from "@/domain/geometry/device-envelope";
import { pillarFootprint } from "@/domain/geometry/pillars";
import { convexFootprintsOverlap } from "@/domain/geometry/footprint";

export type FanCoilPlacement = NonNullable<Project["fanCoils"]>[number];
export type FanCoilPose = Pick<
  FanCoilPlacement,
  "position" | "rotation" | "wallId" | "mounting" | "elevationM"
>;
export function fanCoilEnvelope(unit: FanCoilPlacement): DeviceEnvelope {
  const ceiling = unit.mounting === "ceiling";
  return {
    deviceId: unit.id,
    floorId: unit.floorId,
    roomId: unit.roomId,
    cornersXY: footprintCorners(
      unit.position,
      unit.widthMm / 1000,
      (ceiling ? unit.heightMm : unit.depthMm) / 1000,
      unit.rotation,
    ),
    minZ: ceiling ? unit.elevationM : unit.elevationM - unit.heightMm / 2000,
    maxZ: ceiling
      ? unit.elevationM + unit.depthMm / 1000
      : unit.elevationM + unit.heightMm / 2000,
  };
}
export function fanCoilPlacementValid(
  project: Project,
  unit: FanCoilPlacement,
): boolean {
  const room = project.rooms.find(
    (r) => r.id === unit.roomId && r.floorId === unit.floorId,
  );
  if (!room) return false;
  const envelope = fanCoilEnvelope(unit);
  if (!deviceEnvelopeInsideRoom(envelope, room, unit.mounting === "ceiling"))
    return false;
  if (unit.mounting === "wall" && !room.wallIds.includes(unit.wallId ?? ""))
    return false;
  if (
    [
      ...projectDeviceEnvelopes(project),
      ...(project.fanCoils ?? []).map(fanCoilEnvelope),
    ].some((other) => deviceEnvelopesOverlap(envelope, other))
  )
    return false;
  if (
    (project.pillars ?? []).some(
      (p) =>
        p.floorId === room.floorId &&
        envelope.minZ < p.heightMm / 1000 &&
        convexFootprintsOverlap(envelope.cornersXY, pillarFootprint(p)),
    )
  )
    return false;
  if (unit.mounting === "wall") {
    const wall = project.walls.find((w) => w.id === unit.wallId);
    if (!wall || !roomWallSpan(room, wall)) return false;
    const centerAlong = distance(
      wall.start,
      projection(unit.position, wall.start, wall.end),
    );
    if (
      project.openings.some(
        (o) =>
          o.wallId === wall.id &&
          centerAlong + unit.widthMm / 2000 > o.offsetM &&
          centerAlong - unit.widthMm / 2000 < o.offsetM + o.widthM &&
          envelope.maxZ > (o.sillHeightM ?? 0) &&
          envelope.minZ < (o.sillHeightM ?? 0) + o.heightM,
      )
    )
      return false;
  }
  return true;
}

export function initialFanCoilPose(
  project: Project,
  room: Room,
  product: FanCoilProduct,
  mounting: FanCoilPlacement["mounting"],
): FanCoilPose | null {
  if (!product.mountings.includes(mounting)) return null;
  const base = {
    id: "candidate",
    roomId: room.id,
    floorId: room.floorId,
    productId: product.id,
    catalogVersion: "candidate",
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    depthMm: product.depthMm,
    operatingPointIndex: 0,
    controllerId: null,
    controllerBoard: null,
    locked: false,
  };
  const poses: FanCoilPose[] = [];
  if (mounting === "wall") {
    for (const wall of project.walls.filter((w) =>
      room.wallIds.includes(w.id),
    )) {
      const span = roomWallSpan(room, wall);
      if (!span || span.lengthM < product.widthMm / 1000 + 0.08) continue;
      const rotation = Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      );
      const offsets = [span.lengthM / 2];
      for (
        let offset = product.widthMm / 2000 + 0.04;
        offset <= span.lengthM - product.widthMm / 2000 - 0.04;
        offset += 0.2
      )
        offsets.push(offset);
      for (const offset of offsets)
        poses.push({
          wallId: wall.id,
          mounting,
          position: positionAlongRoomWall(
            room,
            wall,
            offset,
            product.depthMm / 1000,
          ),
          rotation,
          elevationM: 0.1 + product.heightMm / 2000,
        });
    }
  } else {
    const box = bounds(room.polygon);
    const positions: Point[] = [room.centroid];
    for (
      let x = box.minX + product.widthMm / 2000 + 0.02;
      x < box.maxX;
      x += 0.35
    )
      for (
        let y = box.minY + product.heightMm / 2000 + 0.02;
        y < box.maxY;
        y += 0.35
      )
        positions.push({ x, y });
    for (const position of positions)
      poses.push({
        position,
        rotation: 0,
        wallId: null,
        mounting,
        elevationM: room.heightM,
      });
  }
  return (
    poses.find((pose) =>
      fanCoilPlacementValid(project, { ...base, ...pose }),
    ) ?? null
  );
}
