import type { Project, Room } from "@/schemas/project";
import {
  fanCoilCatalog,
  fanCoilProductAtVersion,
  type FanCoilCatalog,
  type FanCoilProduct,
  type FanCoilOperatingPoint,
} from "@/domain/catalogs/fan-coils";
import {
  initialFanCoilPose,
  type FanCoilPlacement,
  type FanCoilPose,
} from "./placement";

export function installedFanCoilCapacity(project: Project, roomId: string) {
  let coolingW = 0,
    heatingW = 0,
    unknownCount = 0;
  for (const unit of project.fanCoils ?? []) {
    if (unit.roomId !== roomId) continue;
    const point = fanCoilProductAtVersion(unit.productId, unit.catalogVersion)
      ?.operatingPoints[unit.operatingPointIndex];
    if (!point) {
      unknownCount++;
      continue;
    }
    coolingW += point.coolingW;
    heatingW += point.heatingW;
  }
  return { coolingW, heatingW, unknownCount };
}
export type FanCoilSuggestion = {
  product: FanCoilProduct;
  operatingPointIndex: number;
  point: FanCoilOperatingPoint;
  pose: FanCoilPose;
  noiseUnverified: boolean;
};
/** Power and noise always come from the same original operating point. */
export function sizeFanCoils(
  project: Project,
  room: Room,
  options: {
    manufacturer?: string;
    family?: string;
    mounting?: FanCoilPlacement["mounting"];
    requiredCoolingW?: number;
    requiredHeatingW?: number;
  } = {},
  catalog: FanCoilCatalog = fanCoilCatalog,
): FanCoilSuggestion[] {
  const installed = installedFanCoilCapacity(project, room.id);
  const coolingW =
    options.requiredCoolingW ??
    Math.max(0, room.designLoadW - installed.coolingW);
  const heatingW =
    options.requiredHeatingW ??
    Math.max(0, room.designLoadW - installed.heatingW);
  if (![coolingW, heatingW].every((v) => Number.isFinite(v) && v >= 0))
    return [];
  const suggestions = catalog.products.flatMap((product) => {
    if (
      (options.manufacturer && options.manufacturer !== product.manufacturer) ||
      (options.family && options.family !== product.family)
    )
      return [];
    const pose = initialFanCoilPose(
      project,
      room,
      product,
      options.mounting ?? "wall",
    );
    if (!pose) return [];
    return product.operatingPoints.flatMap((point, operatingPointIndex) =>
      point.coolingW >= coolingW &&
      point.heatingW >= heatingW &&
      (point.noiseDbA === null ||
        point.noiseDbA <= project.projectSettings.maxNoiseDbA)
        ? [
            {
              product,
              operatingPointIndex,
              point,
              pose,
              noiseUnverified: point.noiseDbA === null,
            },
          ]
        : [],
    );
  });
  return suggestions.sort(
    (a, b) =>
      Number(a.noiseUnverified) - Number(b.noiseUnverified) ||
      a.point.coolingW +
        a.point.heatingW -
        (b.point.coolingW + b.point.heatingW) ||
      (a.point.noiseDbA ?? Infinity) - (b.point.noiseDbA ?? Infinity) ||
      a.product.id.localeCompare(b.product.id),
  );
}
