import type { Point, Project, Room, Wall } from "@/schemas/project";
import {
  fanCoilProductAtVersion,
  isRecessedFanCoil,
  type FanCoilProduct,
} from "@/domain/catalogs/fan-coils";
import { footprintCorners } from "@/domain/geometry/footprint";
import {
  positionAlongRoomWall,
  positionRecessedAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import {
  add,
  area,
  bounds,
  distance,
  projection,
  scale,
  subtract,
} from "@/domain/geometry/primitives";
import {
  deviceEnvelopeInsideRoom,
  deviceEnvelopesOverlap,
  projectDeviceEnvelopes,
  type DeviceEnvelope,
} from "@/domain/geometry/device-envelope";
import { clipToConvex, pillarFootprint } from "@/domain/geometry/pillars";
import { ceilingBandPolygon, roofHeightAt } from "@/domain/geometry/ceilings";
import { convexFootprintsOverlap } from "@/domain/geometry/footprint";

export type FanCoilPlacement = NonNullable<Project["fanCoils"]>[number];
export type FanCoilPose = Pick<
  FanCoilPlacement,
  "position" | "rotation" | "wallId" | "mounting" | "elevationM"
>;

type FanCoilHeightZone = {
  minM: number;
  maxM: number;
  reference: "below" | "band" | "ceiling";
};

/** Spazio disponibile dietro la faccia interna: muratura più controparete. */
function availableWallDepthM(wall: Wall, roomId: string): number {
  return (
    wall.thickness +
    (wall.drywall?.roomId === roomId ? (wall.drywall.offsetM ?? 0) : 0)
  );
}
/** Ceiling poses retain a lower-face datum: exposed bodies hang below, concealed bodies occupy the technical void. */
export function fanCoilCeilingRange(
  project: Project,
  room: Room,
  product: Pick<
    FanCoilProduct,
    | "widthMm"
    | "heightMm"
    | "depthMm"
    | "family"
    | "features"
    | "ceilingInstallation"
  >,
  position: Point,
  rotation = 0,
  mounting: FanCoilPlacement["mounting"] = "ceiling",
): { ranges: FanCoilHeightZone[]; defaultM: number } | null {
  const corners = footprintCorners(
    position,
    product.widthMm / 1000,
    (mounting === "ceiling" ? product.heightMm : product.depthMm) / 1000,
    rotation,
  );
  const structural = Math.min(
    ...corners.map((point) => roofHeightAt(project, room, point)),
  );
  const bands = (room.ceilingBands ?? []).flatMap((band) => {
    const polygon = ceilingBandPolygon(project, room, band);
    if (polygon.length < 3) return [];
    const areaM2 = area(clipToConvex(corners, polygon));
    return areaM2 > 1e-8 ? [{ elevationM: band.elevationM, areaM2 }] : [];
  });
  const depth =
    (mounting === "ceiling" ? product.depthMm : product.heightMm) / 1000;
  const minimum =
    mounting === "ceiling"
      ? Math.max(0.01, product.ceilingInstallation?.minFaceHeightM ?? 0)
      : 0;
  const below =
    Math.min(
      structural,
      room.ceilingHeightM ?? structural,
      ...bands.map((band) => band.elevationM),
    ) - depth;
  const ranges: FanCoilHeightZone[] = [];
  const recessed = isRecessedFanCoil(product);
  // Un apparecchio ad incasso non si appende a vista sotto il soffitto: la posa
  // a soffitto è ammessa solo dentro un vuoto tecnico.
  if (!(recessed && mounting === "ceiling") && below >= minimum)
    ranges.push({ minM: minimum, maxM: below, reference: "below" });
  if (!recessed) return ranges.length ? { ranges, defaultM: below } : null;
  // Valid ceiling bands do not overlap; their clipped areas also cover a joint between adjacent bands.
  const covered = bands.reduce((sum, band) => sum + band.areaM2, 0);
  const footprint = area(corners);
  if (covered > footprint + 1e-8) return null;
  const voids: Array<{
    bottom: number;
    top: number;
    reference: "band" | "ceiling";
  }> = [];
  if (bands.length > 0 && covered >= footprint - 1e-8)
    voids.push({
      bottom: Math.max(...bands.map((band) => band.elevationM)),
      top: room.ceilingHeightM ?? structural,
      reference: "band",
    });
  if (room.ceilingHeightM !== null)
    voids.push({
      bottom: room.ceilingHeightM,
      top: structural,
      reference: "ceiling",
    });
  let defaultM: number | undefined;
  for (const space of voids) {
    const minM = Math.max(space.bottom, minimum),
      maxM = Math.min(space.top, structural) - depth;
    if (minM > maxM + 1e-8) continue;
    ranges.push({ minM, maxM, reference: space.reference });
    defaultM ??= minM;
  }
  return ranges.length ? { ranges, defaultM: defaultM ?? below } : null;
}

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
/**
 * Posa ad incasso su parete: faccia anteriore a filo, corpo nella muratura o
 * nella controparete. Il centro è dietro la faccia interna, quindi il controllo
 * generico «dentro la stanza» non si applica al corpo intero.
 */
export function fanCoilRecessedWallValid(
  project: Project,
  room: Room,
  unit: FanCoilPlacement,
  product: Pick<
    FanCoilProduct,
    "family" | "features" | "ceilingInstallation"
  >,
): boolean {
  const wall = project.walls.find(
    (item) => item.id === unit.wallId && item.floorId === room.floorId,
  );
  if (!wall) return false;
  const span = roomWallSpan(room, wall);
  if (!span || span.lengthM + 1e-6 < unit.widthMm / 1000) return false;
  const depthM = unit.depthMm / 1000;
  if (availableWallDepthM(wall, room.id) + 1e-6 < depthM - 0.002)
    return false;
  const along = distance(
    span.start,
    projection(unit.position, span.start, span.end),
  );
  if (
    along - unit.widthMm / 2000 < -1e-6 ||
    along + unit.widthMm / 2000 > span.lengthM + 1e-6
  )
    return false;
  const expected = positionRecessedAlongRoomWall(room, wall, along, depthM);
  if (distance(unit.position, expected) > 1e-4) return false;
  const v = scale(subtract(span.end, span.start), 1 / span.lengthM);
  const normal = { x: -v.y, y: v.x };
  const frontCenter = add(unit.position, scale(normal, depthM / 2));
  // Solo la faccia a vista deve stare nella stanza: il corpo è nella parete.
  const frontEnvelope = {
    ...fanCoilEnvelope(unit),
    cornersXY: footprintCorners(
      frontCenter,
      unit.widthMm / 1000,
      0.002,
      unit.rotation,
    ),
  };
  if (!deviceEnvelopeInsideRoom(frontEnvelope, room, false, project))
    return false;
  const range = fanCoilCeilingRange(
    project,
    room,
    {
      ...unit,
      family: product.family,
      features: product.features,
      ceilingInstallation: product.ceilingInstallation,
    },
    frontCenter,
    unit.rotation,
    unit.mounting,
  );
  const bottom = unit.elevationM - unit.heightMm / 2000;
  return !!range?.ranges.some(
    (zone) => bottom >= zone.minM - 1e-7 && bottom <= zone.maxM + 1e-7,
  );
}

export function fanCoilPlacementValid(
  project: Project,
  unit: FanCoilPlacement,
  product: Pick<
    FanCoilProduct,
    "family" | "features" | "ceilingInstallation"
  > | null = fanCoilProductAtVersion(unit.productId, unit.catalogVersion),
): boolean {
  const room = project.rooms.find(
    (r) => r.id === unit.roomId && r.floorId === unit.floorId,
  );
  if (!room) return false;
  const envelope = fanCoilEnvelope(unit);
  if (unit.mounting === "ceiling" && !product) return false;
  const recessedWall =
    unit.mounting === "wall" && isRecessedFanCoil(product);
  if (recessedWall) {
    if (!product || !fanCoilRecessedWallValid(project, room, unit, product))
      return false;
  } else {
    if (!deviceEnvelopeInsideRoom(envelope, room, false, project)) return false;
    const range = fanCoilCeilingRange(
      project,
      room,
      {
        ...unit,
        family: product?.family ?? "",
        features: product?.features ?? [],
        ceilingInstallation: product?.ceilingInstallation,
      },
      unit.position,
      unit.rotation,
      unit.mounting,
    );
    const bottom =
      unit.mounting === "ceiling"
        ? unit.elevationM
        : unit.elevationM - unit.heightMm / 2000;
    if (
      !range?.ranges.some(
        (zone) => bottom >= zone.minM - 1e-7 && bottom <= zone.maxM + 1e-7,
      )
    )
      return false;
  }
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
  const recessed = isRecessedFanCoil(product);
  if (mounting === "wall") {
    for (const wall of project.walls.filter((w) =>
      room.wallIds.includes(w.id),
    )) {
      const span = roomWallSpan(room, wall);
      if (!span || span.lengthM < product.widthMm / 1000 + 0.08) continue;
      if (
        recessed &&
        availableWallDepthM(wall, room.id) + 1e-6 <
          product.depthMm / 1000 - 0.002
      )
        continue;
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
          position: recessed
            ? positionRecessedAlongRoomWall(
                room,
                wall,
                offset,
                product.depthMm / 1000,
              )
            : positionAlongRoomWall(
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
    for (const position of positions) {
      const range = fanCoilCeilingRange(project, room, product, position);
      if (!range) continue;
      const pose: FanCoilPose = {
        position,
        rotation: 0,
        wallId: null,
        mounting,
        elevationM: range.defaultM,
      };
      if (fanCoilPlacementValid(project, { ...base, ...pose }, product))
        return pose;
    }
    return null;
  }
  return (
    poses.find((pose) =>
      fanCoilPlacementValid(project, { ...base, ...pose }, product),
    ) ?? null
  );
}
