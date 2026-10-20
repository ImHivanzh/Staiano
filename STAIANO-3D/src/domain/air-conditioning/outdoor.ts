import type { Point, Project } from "@/schemas/project";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";
import { vrvOutdoorAtVersion } from "@/domain/catalogs/vrv";
import {
  initialOutdoorPose,
  outdoorUnitValid,
  type OutdoorUnitLike,
} from "@/domain/hydronic/placement";
import {
  indoorRoute,
  nearestIndoorPoint,
} from "@/domain/geometry/indoor-route";
import { roomCeilingHeightM } from "./elevation";

export type HvacOutdoorDimensions = Pick<
  OutdoorUnitLike,
  "widthMm" | "heightMm" | "depthMm"
> & { model: string; manufacturer: string };
export type RefrigerantRoutePoint = Point & { elevationM: number };

/**
 * shortcut: split catalogue combinations do not publish outdoor-unit dimensions;
 * indicative footprints by total capacity until the source tables are imported.
 */
function splitOutdoorDimensions(
  coolingCapacityW: number,
): Pick<HvacOutdoorDimensions, "widthMm" | "heightMm" | "depthMm"> {
  if (coolingCapacityW <= 2500)
    return { widthMm: 780, heightMm: 550, depthMm: 290 };
  if (coolingCapacityW <= 3500)
    return { widthMm: 870, heightMm: 600, depthMm: 350 };
  if (coolingCapacityW <= 5000)
    return { widthMm: 950, heightMm: 700, depthMm: 350 };
  if (coolingCapacityW <= 6000)
    return { widthMm: 1000, heightMm: 750, depthMm: 400 };
  if (coolingCapacityW <= 8000)
    return { widthMm: 1050, heightMm: 800, depthMm: 450 };
  if (coolingCapacityW <= 10000)
    return { widthMm: 1100, heightMm: 900, depthMm: 500 };
  return { widthMm: 1200, heightMm: 1000, depthMm: 500 };
}

export function hvacOutdoorDimensions(
  system: Project["hvacSystems"][number],
): HvacOutdoorDimensions | null {
  if (system.type === "vrv") {
    const outdoor = vrvOutdoorAtVersion(
      system.productId,
      system.catalogVersion,
    );
    return outdoor
      ? {
          model: outdoor.model,
          manufacturer: outdoor.manufacturer,
          widthMm: outdoor.widthMm,
          heightMm: outdoor.heightMm,
          depthMm: outdoor.depthMm,
        }
      : null;
  }
  if (system.type !== "split") return null;
  const combination = splitCombinationAtVersion(
    system.productId,
    system.catalogVersion,
  );
  if (!combination) return null;
  return {
    model: combination.outdoorModel,
    manufacturer: combination.manufacturer,
    ...splitOutdoorDimensions(combination.coolingCapacityW),
  };
}

export function hvacOutdoorModel(
  system: Project["hvacSystems"][number],
): string | null {
  return hvacOutdoorDimensions(system)?.model ?? null;
}

/** Add a saved outdoor unit on first sizing; a user-moved one is preserved. */
export function withHvacOutdoorUnit(
  project: Project,
  system: Project["hvacSystems"][number],
): Project["hvacSystems"][number] {
  const dimensions = hvacOutdoorDimensions(system);
  if (system.outdoorUnit) {
    if (!dimensions) return system;
    const old = system.outdoorUnit;
    if (
      old.widthMm === dimensions.widthMm &&
      old.heightMm === dimensions.heightMm &&
      old.depthMm === dimensions.depthMm
    )
      return system;
    const outdoorUnit = {
      ...old,
      widthMm: dimensions.widthMm,
      heightMm: dimensions.heightMm,
      depthMm: dimensions.depthMm,
      // Preserve the clearance underneath the unit when its height changes.
      elevationM:
        Math.max(0, old.elevationM - old.heightMm / 2000) +
        dimensions.heightMm / 2000,
    };
    if (!outdoorUnitValid(project, outdoorUnit, old.id))
      throw new Error(
        "Il nuovo modello non entra nella posizione dell’unità esterna. Spostarla in un’area libera prima di cambiare macchina.",
      );
    return { ...system, outdoorUnit };
  }
  const floorId = project.rooms.find((room) =>
    system.roomIds.includes(room.id),
  )?.floorId;
  if (!dimensions || !floorId) return system;
  const pose = initialOutdoorPose(project, floorId, dimensions);
  if (!pose) return system;
  return {
    ...system,
    outdoorUnit: {
      id: crypto.randomUUID(),
      floorId,
      position: pose.position,
      rotation: pose.rotation,
      elevationM: pose.elevationM,
      widthMm: dimensions.widthMm,
      heightMm: dimensions.heightMm,
      depthMm: dimensions.depthMm,
      locked: false,
    },
  };
}

export function moveHvacOutdoorUnit(
  project: Project,
  deviceId: string,
  target: Partial<
    Pick<OutdoorUnitLike, "position" | "rotation" | "elevationM">
  >,
): Project {
  const system = project.hvacSystems.find(
    (item) => item.outdoorUnit?.id === deviceId,
  );
  if (!system?.outdoorUnit) throw new Error("Unità esterna non trovata.");
  if (system.outdoorUnit.locked)
    throw new Error("Sbloccare l'unità esterna prima di spostarla.");
  const unit = { ...system.outdoorUnit, ...target };
  if (!outdoorUnitValid(project, unit, deviceId))
    throw new Error(
      "L'unità esterna deve restare fuori dagli ambienti, libera da muri e ostacoli.",
    );
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((item) =>
      item.id === system.id ? { ...item, outdoorUnit: unit } : item,
    ),
  };
}

/** Illustrative refrigerant route: no pipe diameter or charge calculation. */
export function refrigerantRoute(
  project: Project,
  system: Project["hvacSystems"][number],
  indoorId: string,
): RefrigerantRoutePoint[] {
  const outdoor = system.outdoorUnit,
    indoor = system.indoorUnits.find((unit) => unit.id === indoorId),
    room = project.rooms.find((item) => item.id === indoor?.roomId);
  if (!outdoor || !indoor || !room || indoor.floorId !== outdoor.floorId)
    return [];
  const entry = nearestIndoorPoint(project, outdoor.floorId, outdoor.position),
    route = entry
      ? indoorRoute(project, outdoor.floorId, entry, indoor.position)
      : [];
  if (!route.length) return [];
  const indoorElevationM =
    (roomCeilingHeightM(room) ?? room.heightM) - indoor.heightMm / 2000 - 0.1;
  return [
    { ...outdoor.position, elevationM: outdoor.elevationM },
    ...route.map((point) => ({ ...point, elevationM: 0.12 })),
    { ...indoor.position, elevationM: indoorElevationM },
  ];
}

/** Fallback label for legacy split combinations without catalogue data. */
export function hvacOutdoorLabel(
  project: Project,
  system: Project["hvacSystems"][number],
): string {
  const model = hvacOutdoorModel(system);
  if (model) return model;
  const indoor = system.indoorUnits[0];
  return (
    (indoor &&
      splitIndoorAtVersion(indoor.productId, indoor.catalogVersion)?.model) ||
    system.productId
  );
}
