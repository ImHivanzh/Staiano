import type { Project, Room } from "@/schemas/project";
import type {
  SplitCatalog,
  SplitCombination,
  SplitIndoor,
} from "@/domain/catalogs/split-schema";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "@/domain/geometry/placement";
import { indoorUnitFitsBelowCeiling } from "./elevation";
import { footprintInsideRoom } from "../geometry/footprint";
export type SplitAssignment = {
  roomId: string;
  slotIndex: number;
  indoor: SplitIndoor;
  coolingW: number;
  heatingW: number;
};
export type SplitSolution = {
  combination: SplitCombination;
  assignments: SplitAssignment[];
  requiredW: number;
  excessW: number;
};
export function usableSplitWall(
  project: Project,
  room: Room,
  unit: Pick<SplitIndoor, "widthMm" | "heightMm" | "depthMm">,
) {
  return (
    project.walls
      .filter((w) => room.wallIds.includes(w.id))
      .flatMap((wall) => {
        const span = roomWallSpan(room, wall);
        if (!span || span.lengthM < unit.widthMm / 1000 + 0.2) return [];
        return [
          {
            wall,
            span,
            position: positionAlongRoomWall(
              room,
              wall,
              span.lengthM / 2,
              unit.depthMm / 1000,
            ),
            rotation: Math.atan2(
              span.end.y - span.start.y,
              span.end.x - span.start.x,
            ),
          },
        ];
      })
      .filter(
        (candidate) =>
          indoorUnitFitsBelowCeiling(project, room, {
            ...unit,
            position: candidate.position,
            rotation: candidate.rotation,
          }) &&
          footprintInsideRoom(
            room,
            candidate.position,
            unit.widthMm / 1000,
            unit.depthMm / 1000,
            candidate.rotation,
          ),
      )
      .sort((a, b) => b.span.lengthM - a.span.lengthM)[0] ?? null
  );
}
/** Uses exact approved combinations and simultaneous capacity published for every indoor unit. */
export function sizeSplitSystems(
  project: Project,
  roomIds: string[],
  manufacturer: string,
  catalog: SplitCatalog,
): SplitSolution[] {
  const rooms = project.rooms
    .filter((r) => roomIds.includes(r.id))
    .sort((a, b) => b.designLoadW - a.designLoadW);
  if (
    !rooms.length ||
    rooms.length !== new Set(roomIds).size ||
    rooms.length > 6 ||
    rooms.some(
      (r) =>
        r.designLoadW <= 0 ||
        r.geometryStatus !== "closed" ||
        !project.floors.find((floor) => floor.id === r.floorId)?.scaleVerified,
    )
  )
    return [];
  const models = new Map(catalog.indoorUnits.map((u) => [u.id, u])),
    requiredW = rooms.reduce((s, r) => s + r.designLoadW, 0),
    solutions: SplitSolution[] = [];
  const wallFit = new Map(
    rooms.map((room) => [
      room.id,
      new Set(
        catalog.indoorUnits
          .filter(
            (unit) =>
              unit.manufacturer === manufacturer &&
              usableSplitWall(project, room, unit),
          )
          .map((unit) => unit.id),
      ),
    ]),
  );
  for (const combination of catalog.combinations) {
    if (
      !combination.approved ||
      combination.manufacturer !== manufacturer ||
      combination.indoorProductIds.length !== rooms.length ||
      combination.coolingCapacityW < requiredW ||
      (combination.heatingCapacityW ?? 0) < requiredW ||
      combination.indoorCoolingW.some((v) => v === null) ||
      combination.indoorHeatingW.some((v) => v === null)
    )
      continue;
    const slots = combination.indoorProductIds.map((id, i) => ({
      slotIndex: i,
      indoor: models.get(id)!,
      coolingW: combination.indoorCoolingW[i]!,
      heatingW: combination.indoorHeatingW[i]!,
    }));
    if (
      combination.maxConnectedCapacityW !== null &&
      slots.every((s) => s.indoor.nominalCoolingW !== null) &&
      slots.reduce((sum, s) => sum + (s.indoor.nominalCoolingW ?? 0), 0) >
        combination.maxConnectedCapacityW
    )
      continue;
    const chosen: SplitAssignment[] = [];
    const used = new Set<number>();
    function match(index: number): boolean {
      if (index === rooms.length) return true;
      const room = rooms[index];
      for (const slot of slots) {
        if (
          used.has(slot.slotIndex) ||
          slot.coolingW < room.designLoadW ||
          slot.heatingW < room.designLoadW ||
          !wallFit.get(room.id)?.has(slot.indoor.id)
        )
          continue;
        used.add(slot.slotIndex);
        chosen.push({ ...slot, roomId: room.id });
        if (match(index + 1)) return true;
        used.delete(slot.slotIndex);
        chosen.pop();
      }
      return false;
    }
    if (match(0))
      solutions.push({
        combination,
        assignments: chosen,
        requiredW,
        excessW:
          chosen.reduce((s, a) => s + Math.min(a.coolingW, a.heatingW), 0) -
          requiredW,
      });
  }
  return solutions.sort(
    (a, b) =>
      a.excessW - b.excessW ||
      a.combination.coolingCapacityW - b.combination.coolingCapacityW ||
      Number(a.combination.region === "UK") -
        Number(b.combination.region === "UK") ||
      a.combination.id.localeCompare(b.combination.id),
  );
}
