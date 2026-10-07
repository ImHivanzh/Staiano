import type { Point, Project } from "@/schemas/project";
import type { HydronicSystem } from "./placement";
export type HydronicRoutePoint = Point & { elevationM: number };
/** Illustrative line routing only; these are not calculated hydraulic pipe diameters. */
export function hydronicPipeRoute(
  project: Project,
  system: HydronicSystem,
  fanCoilId: string,
): HydronicRoutePoint[] {
  const coil = project.fanCoils?.find((u) => u.id === fanCoilId);
  if (
    !coil ||
    !system.fanCoilIds.includes(fanCoilId) ||
    coil.floorId !== system.outdoorUnit.floorId
  )
    return [];
  const pump = system.outdoorUnit,
    manual = system.pipeWaypoints?.find(
      (w) => w.fanCoilId === fanCoilId,
    )?.points;
  const elevationM = 0.12;
  return [
    { ...pump.position, elevationM: pump.elevationM },
    ...(manual?.length
      ? manual
      : [{ x: pump.position.x, y: coil.position.y }]
    ).map((p) => ({ ...p, elevationM })),
    { ...coil.position, elevationM: coil.elevationM },
  ];
}
