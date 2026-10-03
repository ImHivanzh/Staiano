import type { Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import {
  roomWallSpan,
  positionAlongRoomWall,
} from "@/domain/geometry/placement";
import { radiatorCatalogs } from "@/domain/catalogs/radiators";
import { elementOutputAtDeltaT, type RadiatorSolution } from "./size";
import { radiatorProducts } from "@/domain/catalogs/radiators";
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
  const walls = project.walls
    .filter(
      (w) =>
        room.wallIds.includes(w.id) && (!fixedWallId || w.id === fixedWallId),
    )
    .map((wall) => ({ wall, span: roomWallSpan(room, wall), occupied: 0.1 }))
    .filter((w) => w.span !== null)
    .sort((a, b) => b.span!.lengthM - a.span!.lengthM);
  const version = radiatorCatalogs.find(
    (c) => c.manufacturer === solution.variant.manufacturer,
  )?.version;
  if (!version) throw new Error("Versione catalogo non disponibile.");
  const units = solution.elements.map((elements, i) => {
    const widthM = solution.widthsMm[i] / 1000;
    const space = walls.find(
      (w) => w.occupied + widthM + 0.1 <= w.span!.lengthM,
    );
    if (!space)
      throw new Error(
        "Ingombro radiatori superiore alla parete libera. Scegliere più pareti o una soluzione diversa.",
      );
    const position = positionAlongRoomWall(
      room,
      space.wall,
      space.occupied + widthM / 2,
      solution.variant.depthMm / 1000,
    );
    space.occupied += widthM + 0.1;
    const span = space.span!;
    return {
      id: newId(),
      roomId,
      floorId: room.floorId,
      wallId: space.wall.id,
      position,
      rotation: Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      ),
      widthMm: solution.widthsMm[i],
      heightMm: solution.variant.heightMm,
      depthMm: solution.variant.depthMm,
      productId: solution.variant.id,
      catalogVersion: version,
      elements,
      outputW: solution.unitPowerW[i],
      deltaTK: solution.deltaTK,
      family: solution.variant.family,
      manufacturer: solution.variant.manufacturer,
    };
  });
  const radiators = [
    ...project.radiators.filter((r) => r.roomId !== roomId),
    ...units,
  ].map((r) => {
    const product = radiatorProducts.find((p) => p.id === r.productId);
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
      [solution.variant.manufacturer]: version,
    },
  };
}
