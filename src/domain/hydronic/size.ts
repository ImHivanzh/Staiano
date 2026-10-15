import type { Point, Project } from "@/schemas/project";
import { heatPumpCatalog } from "../catalogs/heat-pumps";
import { hydronicOutdoorValid, initialHydronicOutdoorPose } from "./placement";

export function recommendedHeatPump(
  project: Project,
  floorId: string,
  options: {
    roomIds: string[];
    manufacturer: string;
    operatingPointIndex: number;
    position?: Point;
    systemId?: string;
  },
) {
  const rooms = project.rooms.filter(
    (room) =>
      options.roomIds.includes(room.id) &&
      room.floorId === floorId &&
      !room.conditioningExclusion,
  );
  const load = rooms.reduce((sum, room) => sum + room.designLoadW, 0);
  if (
    !rooms.length ||
    rooms.length !== new Set(options.roomIds).size ||
    !Number.isFinite(load) ||
    load <= 0
  )
    return null;
  const existing = project.hydronicSystems?.find(
    (system) => system.id === options.systemId,
  )?.outdoorUnit;
  const candidates = heatPumpCatalog.products.filter((product) => {
    if (product.manufacturer !== options.manufacturer) return false;
    const rating =
      product.operatingPoints[options.operatingPointIndex] ??
      product.operatingPoints[0];
    if (rating.coolingW < load || rating.heatingW < load) return false;
    const pose =
      existing ?? initialHydronicOutdoorPose(project, floorId, product);
    return (
      !!pose &&
      hydronicOutdoorValid(project, {
        ...pose,
        position: options.position ?? pose.position,
        id: existing?.id ?? "recommended-pump",
        floorId,
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        depthMm: product.depthMm,
        elevationM: Math.max(pose.elevationM, product.heightMm / 2000),
        locked: false,
      })
    );
  });
  return (
    candidates.sort((a, b) => {
      const first =
        a.operatingPoints[options.operatingPointIndex] ?? a.operatingPoints[0];
      const second =
        b.operatingPoints[options.operatingPointIndex] ?? b.operatingPoints[0];
      return (
        Math.min(first.coolingW, first.heatingW) -
          Math.min(second.coolingW, second.heatingW) ||
        a.widthMm * a.depthMm - b.widthMm * b.depthMm
      );
    })[0] ?? null
  );
}
