import type { CeilingBand, Point, Project, Room } from "@/schemas/project";
import {
  area,
  distance,
  onSegment,
  pointInPolygon,
  projection,
  signedArea,
} from "./primitives";
import { convexFootprintsOverlap } from "./footprint";
import { clipToConvex, pillarFootprint } from "./pillars";
import { calculateThermal } from "../thermal/calculate";
import { roomWallSpan } from "./placement";
import { drywallGeometry } from "./drywall";

export function ceilingBandPolygon(
  project: Project,
  room: Room,
  band: CeilingBand,
): Point[] {
  const wall = project.walls.find((w) => w.id === band.wallId);
  const span = wall && roomWallSpan(room, wall);
  if (!span) return [];
  const dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  const p = {
    x: span.start.x + dx * band.offsetM,
    y: span.start.y + dy * band.offsetM,
  };
  return [
    p,
    { x: p.x + dx * band.lengthM, y: p.y + dy * band.lengthM },
    {
      x: p.x + dx * band.lengthM - dy * band.depthM,
      y: p.y + dy * band.lengthM + dx * band.depthM,
    },
    { x: p.x - dy * band.depthM, y: p.y + dx * band.depthM },
  ];
}

function roofAxis(project: Project, room: Room) {
  const wall = project.walls.find((w) => w.id === room.roof?.ridgeWallId);
  if (!wall) return null;
  const angle = Math.atan2(
    wall.end.y - wall.start.y,
    wall.end.x - wall.start.x,
  );
  const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
  const coordinate = (p: Point) => p.x * normal.x + p.y * normal.y;
  const values = room.polygon.map(coordinate),
    min = Math.min(...values),
    max = Math.max(...values);
  return { coordinate, middle: (min + max) / 2, half: (max - min) / 2 };
}

export function roofHeightAt(project: Project, room: Room, point: Point) {
  const axis = roofAxis(project, room);
  if (!room.roof || !axis || axis.half < 1e-6) return room.heightM;
  return (
    room.heightM +
    (room.roof.ridgeHeightM - room.heightM) *
      Math.max(
        0,
        1 - Math.abs(axis.coordinate(point) - axis.middle) / axis.half,
      )
  );
}

/** Split along the ridge so every output polygon lies on one roof plane. */
export function roofPlanes(
  project: Project,
  room: Room,
  polygon = room.polygon,
): Point[][] {
  const axis = roofAxis(project, room);
  if (!axis || !room.roof) return [polygon];
  return [-1, 1]
    .map((side) => {
      const result: Point[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        const da = (axis.coordinate(a) - axis.middle) * side,
          db = (axis.coordinate(b) - axis.middle) * side;
        if (da >= -1e-8) result.push(a);
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
          const t = da / (da - db);
          result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      return result;
    })
    .filter((points) => points.length >= 3 && area(points) > 1e-8);
}

export function ceilingHeightAt(project: Project, room: Room, point: Point) {
  let height = room.ceilingHeightM ?? roofHeightAt(project, room, point);
  for (const band of room.ceilingBands ?? [])
    if (insideOrOn(point, ceilingBandPolygon(project, room, band)))
      height = Math.min(height, band.elevationM);
  return height;
}

/** Quota finita minima sull’intero ingombro convesso, anche sopra fasce interne. */
export function minimumCeilingHeightM(
  project: Project,
  room: Room,
  footprint: Point[],
) {
  if (footprint.length < 3 || area(footprint) <= 1e-8) return 0;
  const roofPoints = roofPlanes(project, room, footprint).flat();
  if (!roofPoints.length) return 0;
  let height = Math.min(
    room.ceilingHeightM ?? Infinity,
    ...roofPoints.map((point) => roofHeightAt(project, room, point)),
  );
  for (const band of room.ceilingBands ?? []) {
    const polygon = ceilingBandPolygon(project, room, band);
    if (polygon.length >= 3 && area(clipToConvex(footprint, polygon)) > 1e-8)
      height = Math.min(height, band.elevationM);
  }
  return height;
}

export function validateCeilingBand(
  project: Project,
  room: Room,
  band: CeilingBand,
) {
  const polygon = ceilingBandPolygon(project, room, band);
  if (
    polygon.length !== 4 ||
    polygon.some((p) => !insideOrOn(p, room.polygon)) ||
    polygon.some(
      (p, i) =>
        !insideOrOn(
          {
            x: (p.x + polygon[(i + 1) % polygon.length].x) / 2,
            y: (p.y + polygon[(i + 1) % polygon.length].y) / 2,
          },
          room.polygon,
        ),
    ) ||
    band.elevationM >= (room.ceilingHeightM ?? room.heightM)
  )
    throw new Error(
      "La fascia deve rientrare nella stanza e stare sotto il soffitto centrale.",
    );
  if (
    (room.ceilingBands ?? []).some(
      (other) =>
        other.id !== band.id &&
        convexFootprintsOverlap(
          polygon,
          ceilingBandPolygon(project, room, other),
        ),
    )
  )
    throw new Error("Le fasce del controsoffitto non possono sovrapporsi.");
}

function insideOrOn(point: Point, polygon: Point[]) {
  return (
    pointInPolygon(point, polygon) ||
    polygon.some((p, i) =>
      onSegment(point, p, polygon[(i + 1) % polygon.length]),
    )
  );
}

export function ceilingFrontPose(
  project: Project,
  terminal: Project["airTerminals"][number],
  target = terminal.position,
  edgeIndex?: number,
) {
  const room = project.rooms.find((r) => r.id === terminal.roomId);
  const band = room?.ceilingBands?.find((b) => b.id === terminal.ceilingBandId);
  if (!room || !band) throw new Error("Fascia del controsoffitto inesistente.");
  const polygon = ceilingBandPolygon(project, room, band);
  const edges = polygon
    .map((a, i) => ({ a, b: polygon[(i + 1) % polygon.length], index: i }))
    .filter((e) => edgeIndex === undefined || e.index === edgeIndex)
    .sort(
      (a, b) =>
        distance(target, projection(target, a.a, a.b)) -
        distance(target, projection(target, b.a, b.b)),
    );
  const edge = edges[0];
  if (!edge || distance(edge.a, edge.b) < terminal.widthMm / 1000 + 0.01)
    throw new Error("Il fronte non ha spazio per questa bocchetta.");
  const length = distance(edge.a, edge.b),
    dx = (edge.b.x - edge.a.x) / length,
    dy = (edge.b.y - edge.a.y) / length;
  const half = terminal.widthMm / 2000 + 0.005;
  const along = Math.max(
    half,
    Math.min(
      length - half,
      (target.x - edge.a.x) * dx + (target.y - edge.a.y) * dy,
    ),
  );
  const clearance = (terminal.depthMm ?? 0) / 2000 + 0.002;
  const sign = signedArea(polygon) > 0 ? 1 : -1;
  const position = {
    x: edge.a.x + dx * along + dy * clearance * sign,
    y: edge.a.y + dy * along - dx * clearance * sign,
  };
  const top = room.ceilingHeightM ?? roofHeightAt(project, room, position);
  const low = band.elevationM + terminal.heightMm / 2000 + 0.005,
    high = top - terminal.heightMm / 2000 - 0.005;
  if (low > high)
    throw new Error(
      "Il ribassamento è troppo basso per l’altezza della bocchetta.",
    );
  return {
    position,
    roomId: room.id,
    wallId: null,
    rotation: Math.atan2(dy, dx) + (sign > 0 ? Math.PI : 0),
    ceilingBandId: band.id,
    ceilingEdge: edge.index,
    elevationM: Math.max(
      low,
      Math.min(high, terminal.elevationM ?? (low + high) / 2),
    ),
    label: `Fronte ${band.name}`,
  };
}

export function syncCeilingTerminals(project: Project): Project {
  return {
    ...project,
    airTerminals: project.airTerminals.map((t) => {
      if (t.ceilingBandId)
        return {
          ...t,
          ...ceilingFrontPose(project, t, t.position, t.ceilingEdge),
        };
      const room = project.rooms.find((r) => r.id === t.roomId);
      return room && t.mounting === "ceiling" && t.elevationM !== null
        ? { ...t, elevationM: ceilingHeightAt(project, room, t.position) }
        : t;
    }),
  };
}

/** Integrate each planar roof face, subtract measured lowered bands and pillar footprints. */
export function calculateRoomThermal(project: Project, room: Room) {
  if (!room.roof && !room.ceilingBands?.length)
    return calculateThermal(
      room.netAreaM2,
      room.ceilingHeightM ?? room.heightM,
      project.projectSettings.coefficientWm3,
    );
  const topVolume = (polygon: Point[]) => {
    if (polygon.length < 3) return 0;
    if (room.ceilingHeightM !== null)
      return area(polygon) * room.ceilingHeightM;
    return roofPlanes(project, room, polygon).reduce((sum, plane) => {
      const a = plane[0];
      let volume = 0;
      for (let i = 1; i < plane.length - 1; i++) {
        const b = plane[i],
          c = plane[i + 1];
        volume +=
          (signedArea([a, b, c]) *
            (roofHeightAt(project, room, a) +
              roofHeightAt(project, room, b) +
              roofHeightAt(project, room, c))) /
          3;
      }
      return sum + Math.abs(volume);
    }, 0);
  };
  const clearVolume = (polygon: Point[]) =>
    topVolume(polygon) -
    (room.ceilingBands ?? []).reduce((sum, band) => {
      const intersection = clipToConvex(
        polygon,
        ceilingBandPolygon(project, room, band),
      );
      return (
        sum + topVolume(intersection) - area(intersection) * band.elevationM
      );
    }, 0);
  const linings = project.walls
    .filter((w) => w.drywall?.roomId === room.id && w.drywall.offsetM > 0)
    .flatMap((w) => {
      const lining = drywallGeometry(project, w);
      return lining ? [lining.polygon] : [];
    });
  const outsideLinings = (polygon: Point[]) =>
    clearVolume(polygon) -
    linings.reduce(
      (sum, lining) => sum + clearVolume(clipToConvex(polygon, lining)),
      0,
    );
  const volumeM3 =
    outsideLinings(room.polygon) -
    (project.pillars ?? [])
      .filter((p) => p.floorId === room.floorId)
      .reduce(
        (sum, pillar) =>
          sum +
          outsideLinings(clipToConvex(room.polygon, pillarFootprint(pillar))),
        0,
      );
  return calculateThermal(
    room.netAreaM2,
    volumeM3 / room.netAreaM2,
    project.projectSettings.coefficientWm3,
  );
}
