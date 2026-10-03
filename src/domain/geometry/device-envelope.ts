import type { Point, Project, Room } from "@/schemas/project";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { footprintCorners, convexFootprintsOverlap } from "./footprint";
import {
  lineIntersection,
  onSegment,
  pointInPolygon,
  samePoint,
} from "./primitives";

/** Physical envelope in plan (XY); vertical Z is measured from its floor. */
export type DeviceEnvelope = {
  deviceId: string;
  floorId: string;
  roomId: string;
  cornersXY: Point[];
  minZ: number;
  maxZ: number;
};

type Placement =
  | Project["radiators"][number]
  | Project["airTerminals"][number]
  | Project["hvacSystems"][number]["indoorUnits"][number];

function envelope(
  item: Placement,
  planDepthM: number,
  minZ: number,
  maxZ: number,
): DeviceEnvelope {
  return {
    deviceId: item.id,
    floorId: item.floorId,
    roomId: item.roomId,
    cornersXY: footprintCorners(
      item.position,
      item.widthMm / 1000,
      planDepthM,
      item.rotation,
    ),
    minZ,
    maxZ,
  };
}

/** Unknown installation data never receives an invented physical envelope. */
export function deviceEnvelope(
  project: Project,
  deviceId: string,
): DeviceEnvelope | null {
  const radiator = project.radiators.find((d) => d.id === deviceId);
  if (radiator)
    return envelope(
      radiator,
      radiator.depthMm / 1000,
      0.1,
      0.1 + radiator.heightMm / 1000,
    );
  const terminal = project.airTerminals.find((d) => d.id === deviceId);
  if (terminal) {
    if (
      needsTerminalReconfiguration(terminal) ||
      terminal.depthMm === null ||
      terminal.elevationM === null
    )
      return null;
    if (terminal.mounting === "ceiling")
      return envelope(
        terminal,
        terminal.heightMm / 1000,
        terminal.elevationM,
        terminal.elevationM + terminal.depthMm / 1000,
      );
    return envelope(
      terminal,
      terminal.depthMm / 1000,
      terminal.elevationM - terminal.heightMm / 2000,
      terminal.elevationM + terminal.heightMm / 2000,
    );
  }
  const unit = project.hvacSystems
    .filter((s) => s.type === "split")
    .flatMap((s) => s.indoorUnits)
    .find((d) => d.id === deviceId);
  const room =
    unit &&
    project.rooms.find(
      (r) => r.id === unit.roomId && r.floorId === unit.floorId,
    );
  if (!unit || !room) return null;
  const centerZ = splitCenterElevationM(room, unit);
  return envelope(
    unit,
    unit.depthMm / 1000,
    centerZ - unit.heightMm / 2000,
    centerZ + unit.heightMm / 2000,
  );
}

export function projectDeviceEnvelopes(project: Project): DeviceEnvelope[] {
  return [
    ...project.radiators,
    ...project.airTerminals,
    ...project.hvacSystems
      .filter((s) => s.type === "split")
      .flatMap((s) => s.indoorUnits),
  ].flatMap((device) => {
    const result = deviceEnvelope(project, device.id);
    return result ? [result] : [];
  });
}

/** Touching surfaces have no overlapping volume; stacked devices are allowed. */
export function deviceEnvelopesOverlap(
  a: DeviceEnvelope,
  b: DeviceEnvelope,
): boolean {
  return (
    a.floorId === b.floorId &&
    a.deviceId !== b.deviceId &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 1e-7 &&
    convexFootprintsOverlap(a.cornersXY, b.cornersXY)
  );
}

/** Ceiling terminal depth extends above its face into the ceiling, as in 3D. */
export function deviceEnvelopeInsideRoom(
  envelope: DeviceEnvelope,
  room: Room,
  allowAboveCeiling = false,
): boolean {
  if (
    envelope.roomId !== room.id ||
    envelope.floorId !== room.floorId ||
    envelope.minZ < -1e-7 ||
    (allowAboveCeiling
      ? envelope.minZ > room.heightM + 1e-7
      : envelope.maxZ > room.heightM + 1e-7) ||
    !envelope.cornersXY.every((corner) => pointInPolygon(corner, room.polygon))
  )
    return false;
  for (let i = 0; i < envelope.cornersXY.length; i++)
    for (let j = 0; j < room.polygon.length; j++) {
      const a = envelope.cornersXY[i],
        b = envelope.cornersXY[(i + 1) % envelope.cornersXY.length],
        c = room.polygon[j],
        d = room.polygon[(j + 1) % room.polygon.length],
        hit = lineIntersection(a, b, c, d);
      if (
        hit &&
        onSegment(hit, a, b) &&
        onSegment(hit, c, d) &&
        ![a, b, c, d].some((p) => samePoint(p, hit))
      )
        return false;
    }
  return true;
}
