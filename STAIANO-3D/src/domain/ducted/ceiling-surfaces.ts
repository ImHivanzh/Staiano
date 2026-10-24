import { Box3, Ray, ShapeUtils, Triangle, Vector2, Vector3 } from "three";
import type { Point, Project } from "@/schemas/project";
import { ceilingBandPolygon } from "../geometry/ceilings";
import { ceilingShellPositions } from "../geometry/ceiling-shell";
import { segmentDistance } from "./duct-bodies";

export type CeilingSurface = {
  deviceId: string;
  floorId: string;
  label: string;
  bounds: Box3;
  triangles: Array<{ triangle: Triangle; bounds: Box3 }>;
};

/** Finite skins only: the technical void inside a lowered band stays empty. */
export function ceilingSurfaces(
  project: Project,
  floorId: string,
): CeilingSurface[] {
  const result: CeilingSurface[] = [];
  const add = (deviceId: string, label: string, positions: number[]) => {
    const triangles: CeilingSurface["triangles"] = [];
    for (let i = 0; i < positions.length; i += 9) {
      const triangle = new Triangle(
        ...([0, 3, 6].map((offset) =>
          new Vector3().fromArray(positions, i + offset),
        ) as [Vector3, Vector3, Vector3]),
      );
      if (triangle.getArea() <= 1e-12) continue;
      triangles.push({
        triangle,
        bounds: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]),
      });
    }
    if (!triangles.length) return;
    const bounds = new Box3();
    for (const facet of triangles) bounds.union(facet.bounds);
    result.push({ deviceId, floorId, label, bounds, triangles });
  };
  const flat = (polygon: Point[], height: number) =>
    ShapeUtils.triangulateShape(
      polygon.map((p) => new Vector2(p.x, p.y)),
      [],
    ).flatMap((face) =>
      face.flatMap((index) => [polygon[index].x, height, polygon[index].y]),
    );
  for (const room of project.rooms.filter((room) => room.floorId === floorId)) {
    add(
      `roof:${room.id}`,
      `soffitto ${room.name}`,
      ceilingShellPositions(project, room, room.polygon),
    );
    if (room.ceilingHeightM !== null)
      add(
        `ceiling:${room.id}`,
        `controsoffitto ${room.name}`,
        flat(room.polygon, room.ceilingHeightM),
      );
    for (const band of room.ceilingBands ?? [])
      add(
        band.id,
        `fascia ${band.name}`,
        ceilingShellPositions(
          project,
          room,
          ceilingBandPolygon(project, room, band),
          band.elevationM,
          band.id,
        ),
      );
  }
  return result;
}

/** Capsule-to-triangle contact, including edges and faces between sampled centres. */
export function segmentHitsCeilingSurface(
  a: Vector3,
  b: Vector3,
  radius: number,
  surface: CeilingSurface,
): boolean {
  const bounds = new Box3().setFromPoints([a, b]).expandByScalar(radius);
  if (!bounds.intersectsBox(surface.bounds)) return false;
  const lengthSq = a.distanceToSquared(b),
    direction = b.clone().sub(a).normalize(),
    ray = new Ray(a, direction);
  const near = new Vector3(),
    intersection = new Vector3(),
    limit = (radius - 1e-5) ** 2;
  for (const { triangle, bounds: facetBounds } of surface.triangles) {
    if (!bounds.intersectsBox(facetBounds)) continue;
    if (
      lengthSq > 1e-16 &&
      ray.intersectTriangle(
        triangle.a,
        triangle.b,
        triangle.c,
        false,
        intersection,
      ) &&
      a.distanceToSquared(intersection) <= lengthSq + 1e-12
    )
      return true;
    if (
      a.distanceToSquared(triangle.closestPointToPoint(a, near)) < limit ||
      b.distanceToSquared(triangle.closestPointToPoint(b, near)) < limit
    )
      return true;
    for (const [c, d] of [
      [triangle.a, triangle.b],
      [triangle.b, triangle.c],
      [triangle.c, triangle.a],
    ])
      if (segmentDistance(a, b, c, d) < limit) return true;
  }
  return false;
}
