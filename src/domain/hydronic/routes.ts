import type { Point, Project } from "@/schemas/project";
import type { HydronicSystem } from "./placement";
import {
  indoorRoute,
  nearestIndoorPoint,
} from "@/domain/geometry/indoor-route";
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
  const entry = nearestIndoorPoint(project, pump.floorId, pump.position);
  const automatic = entry
    ? indoorRoute(project, pump.floorId, entry, coil.position)
    : [];
  if (!manual?.length && !automatic.length) return [];
  return [
    { ...pump.position, elevationM: pump.elevationM },
    ...(manual?.length ? manual : automatic).map((p) => ({ ...p, elevationM })),
    { ...coil.position, elevationM: coil.elevationM },
  ];
}
