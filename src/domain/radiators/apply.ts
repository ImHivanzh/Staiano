import type { Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import {
  roomWallSpan,
  positionAlongRoomWall,
} from "@/domain/geometry/placement";
import { radiatorCatalogs } from "@/domain/catalogs/radiators";
import { elementOutputAtDeltaT, type RadiatorSolution } from "./size";
import { radiatorProductAtVersion } from "@/domain/catalogs/radiators";
import {
  footprintCorners,
  footprintInsideRoom,
  convexFootprintsOverlap,
} from "@/domain/geometry/footprint";
export function applyRadiatorSolution(
  project: Project,
  roomId: string,
  solution: RadiatorSolution,
  fixedWallId: string | null,
): Project {
  const room = project.rooms.find((r) => r.id === roomId);
  if (
    !room ||
    !project.floors.find((f) => f.id === room.floorId)?.scaleVerified
  )
    throw new Error("Stanza o scala non valida.");
  if (room.geometryStatus === "unresolved")
    throw new Error(
      "Chiudere il contorno della stanza prima di dimensionare i radiatori.",
    );
  const walls = project.walls
    .filter(
      (w) =>
        room.wallIds.includes(w.id) && (!fixedWallId || w.id === fixedWallId),
    )
    .map((wall) => ({ wall, span: roomWallSpan(room, wall), occupied: 0.1 }))
    .filter((w) => w.span !== null)
    .sort((a, b) => b.span!.lengthM - a.span!.lengthM);
  if (!solution.searchComplete)
    throw new Error("Attendere la certificazione completa della soluzione.");
  if (
    solution.units.reduce((sum, unit) => sum + unit.powerW, 0) <
    room.designLoadW
  )
    throw new Error(
      "La soluzione non copre il fabbisogno attuale della stanza. Ricalcolare i radiatori.",
    );
  const footprints: ReturnType<typeof footprintCorners>[] = [];
  const units = solution.units.map(({ variant, elements, widthMm, powerW }) => {
    if (
      (solution.selectedManufacturer &&
        variant.manufacturer !== solution.selectedManufacturer) ||
      (solution.selectedFamily && variant.family !== solution.selectedFamily)
    )
      throw new Error("Combinazione radiatori estranea alla famiglia scelta.");
    const version = radiatorCatalogs.find(
      (c) => c.manufacturer === variant.manufacturer,
    )?.version;
    if (!version) throw new Error("Versione catalogo non disponibile.");
    if (
      !variant.commercialElementCounts.includes(elements) ||
      variant.heightMm + 100 > room.heightM * 1000
    )
      throw new Error(
        "Batteria non commerciale o altezza superiore alla stanza.",
      );
    const actualWidth = variant.pitchMm * elements + variant.widthAdditionMm;
    const actualOutput =
      elementOutputAtDeltaT(variant, solution.deltaTK) * elements;
    if (widthMm !== actualWidth || powerW !== actualOutput)
      throw new Error("Ingombro o resa non corrispondente al catalogo.");
    const widthM = widthMm / 1000;
    let placement: {
      space: (typeof walls)[number];
      position: ReturnType<typeof positionAlongRoomWall>;
      rotation: number;
      offset: number;
    } | null = null;
    for (const space of walls) {
      const span = space.span!;
      const rotation = Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      );
      for (
        let offset = space.occupied;
        offset + widthM + 0.1 <= span.lengthM;
        offset += 0.05
      ) {
        const position = positionAlongRoomWall(
          room,
          space.wall,
          offset + widthM / 2,
          variant.depthMm / 1000,
        );
        const corners = footprintCorners(
          position,
          widthM,
          variant.depthMm / 1000,
          rotation,
        );
        if (
          !footprintInsideRoom(
            room,
            position,
            widthM,
            variant.depthMm / 1000,
            rotation,
          ) ||
          footprints.some((other) => convexFootprintsOverlap(corners, other))
        )
          continue;
        placement = { space, position, rotation, offset };
        footprints.push(corners);
        break;
      }
      if (placement) break;
    }
    if (!placement)
      throw new Error(
        "Ingombro radiatori superiore alla parete libera. Scegliere più pareti o una soluzione diversa.",
      );
    const { space, position, rotation, offset } = placement;
    space.occupied = offset + widthM + 0.1;
    return {
      id: newId(),
      roomId,
      floorId: room.floorId,
      wallId: space.wall.id,
      position,
      rotation,
      widthMm,
      heightMm: variant.heightMm,
      depthMm: variant.depthMm,
      productId: variant.id,
      catalogVersion: version,
      elements,
      outputW: powerW,
      deltaTK: solution.deltaTK,
      family: variant.family,
      manufacturer: variant.manufacturer,
      locked: false,
    };
  });
  const radiators = [
    ...project.radiators.filter((r) => r.roomId !== roomId),
    ...units,
  ].map((r) => {
    const product = radiatorProductAtVersion(r.productId, r.catalogVersion);
    return product
      ? {
          ...r,
          deltaTK: solution.deltaTK,
          outputW:
            elementOutputAtDeltaT(product, solution.deltaTK) * r.elements,
        }
      : r;
  });
  return {
    ...project,
    projectSettings: {
      ...project.projectSettings,
      radiatorDeltaTK: solution.deltaTK,
    },
    rooms: project.rooms.map((r) =>
      r.id === roomId ? { ...r, systemType: "radiator" } : r,
    ),
    radiators,
    catalogVersions: {
      ...project.catalogVersions,
      ...Object.fromEntries(
        units.map((unit) => [unit.manufacturer, unit.catalogVersion]),
      ),
    },
  };
}
