import type { Point, Project } from "@/schemas/project";
import type { HeatPumpProduct } from "@/domain/catalogs/heat-pumps";
import {
  footprintCorners,
  convexFootprintsOverlap,
} from "@/domain/geometry/footprint";
import {
  bounds,
  distance,
  lineIntersection,
  onSegment,
  pointInPolygon,
} from "@/domain/geometry/primitives";

export type HydronicSystem = NonNullable<Project["hydronicSystems"]>[number];
export type HydronicOutdoorUnit = HydronicSystem["outdoorUnit"];
export type HydronicPose = Pick<
  HydronicOutdoorUnit,
  "position" | "rotation" | "elevationM"
>;
export const hydronicOutdoorFootprint = (unit: HydronicOutdoorUnit) =>
  footprintCorners(
    unit.position,
    unit.widthMm / 1000,
    unit.depthMm / 1000,
    unit.rotation,
  );

/** Handles concave rooms too: containment plus all edge crossings, not convex SAT. */
function overlapsPolygon(a: Point[], b: Point[]) {
  if (
    a.some((p) => pointInPolygon(p, b)) ||
    b.some((p) => pointInPolygon(p, a))
  )
    return true;
  return a.some((p, i) =>
    b.some((q, j) => {
      const an = a[(i + 1) % a.length],
        bn = b[(j + 1) % b.length],
        hit = lineIntersection(p, an, q, bn);
      return hit
        ? onSegment(hit, p, an) && onSegment(hit, q, bn)
        : onSegment(q, p, an) || onSegment(bn, p, an) || onSegment(p, q, bn);
    }),
  );
}
export function hydronicOutdoorValid(
  project: Project,
  unit: HydronicOutdoorUnit,
  ignoreDeviceId = unit.id,
): boolean {
  if (
    !project.floors.some((f) => f.id === unit.floorId && f.scaleVerified) ||
    ![
      unit.position.x,
      unit.position.y,
      unit.rotation,
      unit.elevationM,
      unit.widthMm,
      unit.heightMm,
      unit.depthMm,
    ].every(Number.isFinite) ||
    unit.widthMm <= 0 ||
    unit.heightMm <= 0 ||
    unit.depthMm <= 0 ||
    unit.elevationM < unit.heightMm / 2000 ||
    Math.abs(unit.position.x) > 10000 ||
    Math.abs(unit.position.y) > 10000 ||
    unit.elevationM > 100
  )
    return false;
  const rooms = project.rooms.filter((r) => r.floorId === unit.floorId),
    walls = project.walls.filter((w) => w.floorId === unit.floorId);
  if (!rooms.length || rooms.some((r) => r.geometryStatus !== "closed"))
    return false;
  const corners = hydronicOutdoorFootprint(unit);
  if (rooms.some((r) => overlapsPolygon(corners, r.polygon))) return false;
  if (
    walls.some((w) =>
      convexFootprintsOverlap(
        corners,
        footprintCorners(
          { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 },
          distance(w.start, w.end) + w.thickness,
          w.thickness,
          Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x),
        ),
      ),
    )
  )
    return false;
  if (
    (project.pillars ?? []).some(
      (p) =>
        p.floorId === unit.floorId &&
        convexFootprintsOverlap(
          corners,
          footprintCorners(
            p.position,
            p.widthMm / 1000,
            p.depthMm / 1000,
            p.rotation,
          ),
        ),
    )
  )
    return false;
  return !(project.hydronicSystems ?? []).some(
    (s) =>
      s.outdoorUnit.id !== ignoreDeviceId &&
      s.outdoorUnit.floorId === unit.floorId &&
      convexFootprintsOverlap(corners, hydronicOutdoorFootprint(s.outdoorUnit)),
  );
}
export function initialHydronicOutdoorPose(
  project: Project,
  floorId: string,
  product: HeatPumpProduct,
): HydronicPose | null {
  const walls = project.walls.filter((w) => w.floorId === floorId);
  const b = bounds([
    ...walls.flatMap((w) => [w.start, w.end]),
    ...project.rooms
      .filter((r) => r.floorId === floorId)
      .flatMap((r) => r.polygon),
  ]);
  const wallMargin = Math.max(0, ...walls.map((w) => w.thickness / 2));
  // ponytail: a finite exterior strip search; use a site boundary polygon when surveying property limits.
  const width = product.widthMm / 1000,
    depth = product.depthMm / 1000;
  for (let step = 0; step < 100; step++) {
    const pose = {
      position: {
        x: b.minX + width / 2 + step * (width + 0.3),
        y: b.minY - wallMargin - depth / 2 - 0.5,
      },
      rotation: 0,
      elevationM: product.heightMm / 2000,
    };
    if (
      hydronicOutdoorValid(project, {
        id: "candidate",
        floorId,
        ...pose,
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        depthMm: product.depthMm,
        locked: false,
      })
    )
      return pose;
  }
  return null;
}
