import type { Pillar, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import { area, cross, lineIntersection, subtract } from "./primitives";
import { footprintCorners } from "./footprint";

export const pillarFootprint = (p: Pillar) =>
  footprintCorners(p.position, p.widthMm / 1000, p.depthMm / 1000, p.rotation);

/** Clip the room to a convex pillar, retaining physical net usable area. */
export function pillarAreaInRoom(pillar: Pillar, polygon: Point[]) {
  const polygonInRoom = clipToConvex(polygon, pillarFootprint(pillar));
  return polygonInRoom.length >= 3 ? area(polygonInRoom) : 0;
}

export function clipToConvex(polygon: Point[], clip: Point[]) {
  const orientation =
    clip.reduce((sum, p, i) => sum + cross(p, clip[(i + 1) % clip.length]), 0) >
    0
      ? 1
      : -1;
  let output = polygon;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const inside = (p: Point) =>
      orientation * cross(subtract(b, a), subtract(p, a)) >= -1e-8;
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input.at(-1)!;
    for (const current of input) {
      if (inside(current) !== inside(previous)) {
        const intersection = lineIntersection(previous, current, a, b);
        if (intersection) output.push(intersection);
      }
      if (inside(current)) output.push(current);
      previous = current;
    }
  }
  return output;
}

export function addPillar(
  project: Project,
  floorId: string,
  input: Omit<Pillar, "id" | "floorId" | "locked">,
): Project {
  if (!project.floors.some((f) => f.id === floorId))
    throw new Error("Piano inesistente.");
  if (
    ![input.widthMm, input.depthMm, input.heightMm].every(
      (v) => Number.isFinite(v) && v > 0 && v <= 30000,
    )
  )
    throw new Error("Dimensioni pilastro positive necessarie.");
  return {
    ...project,
    pillars: [
      ...(project.pillars ?? []),
      { ...input, id: newId(), floorId, locked: false },
    ],
  };
}
