import type { Project } from "@/schemas/project";
import type {
  VrvCatalog,
  VrvIndoor,
  VrvOutdoor,
} from "@/domain/catalogs/vrv-schema";
import { usableSplitWall as usableVrvWall } from "./size";
export { usableVrvWall };

export type VrvAssignment = {
  roomId: string;
  indoor: VrvIndoor;
  coolingW: number;
  heatingW: number;
};
export type VrvSolution = {
  outdoor: VrvOutdoor;
  assignments: VrvAssignment[];
  requiredW: number;
  connectedCoolingW: number;
  connectedHeatingW: number;
  connectionRatio: number;
};

/**
 * Selects one published indoor class per room and an outdoor unit whose
 * documented connection ratio (50–130%) covers the sum of nominal capacities.
 * Room capacities are nominal catalogue values; no simultaneous capacity is
 * invented for a partial-load VRV combination.
 */
export function sizeVrvSystems(
  project: Project,
  roomIds: string[],
  catalog: VrvCatalog,
): VrvSolution[] {
  const rooms = project.rooms
    .filter((room) => roomIds.includes(room.id))
    .sort((a, b) => b.designLoadW - a.designLoadW);
  if (
    !rooms.length ||
    rooms.length !== new Set(roomIds).size ||
    rooms.length > 6 ||
    rooms.some(
      (room) =>
        room.designLoadW <= 0 ||
        room.geometryStatus !== "closed" ||
        !project.floors.find((floor) => floor.id === room.floorId)
          ?.scaleVerified,
    )
  )
    return [];
  const options = rooms.map((room) =>
    catalog.indoorUnits
      .filter(
        (unit) =>
          unit.nominalCoolingW >= room.designLoadW &&
          unit.nominalHeatingW >= room.designLoadW &&
          usableVrvWall(project, room, unit),
      )
      .sort(
        (a, b) =>
          a.nominalCoolingW - b.nominalCoolingW ||
          a.nominalHeatingW - b.nominalHeatingW ||
          a.id.localeCompare(b.id),
      ),
  );
  if (options.some((candidates) => !candidates.length)) return [];
  const suffixCooling = [...rooms.keys()].map((_, index) =>
    options
      .slice(index)
      .reduce(
        (sum, candidates) =>
          sum + Math.min(...candidates.map((u) => u.nominalCoolingW)),
        0,
      ),
  );
  const requiredW = rooms.reduce((sum, room) => sum + room.designLoadW, 0);
  const solutions: VrvSolution[] = [];
  for (const outdoor of [...catalog.outdoorUnits].sort(
    (a, b) => a.coolingW - b.coolingW || a.id.localeCompare(b.id),
  )) {
    if (outdoor.coolingW < requiredW || outdoor.heatingW < requiredW) continue;
    const minConnected = (outdoor.coolingW * outdoor.minConnectionRatio) / 100,
      maxConnected = (outdoor.coolingW * outdoor.maxConnectionRatio) / 100;
    let best: { units: VrvIndoor[]; cooling: number; heating: number } | null =
      null;
    const chosen: VrvIndoor[] = [];
    const search = (index: number, cooling: number, heating: number) => {
      if (cooling > maxConnected) return;
      if (index === rooms.length) {
        if (cooling < minConnected) return;
        if (
          !best ||
          cooling < best.cooling ||
          (cooling === best.cooling && heating < best.heating)
        )
          best = { units: [...chosen], cooling, heating };
        return;
      }
      if (best && cooling + suffixCooling[index] > best.cooling) return;
      for (const unit of options[index]) {
        if (cooling + unit.nominalCoolingW > maxConnected) break;
        chosen.push(unit);
        search(
          index + 1,
          cooling + unit.nominalCoolingW,
          heating + unit.nominalHeatingW,
        );
        chosen.pop();
      }
    };
    search(0, 0, 0);
    const found = best as {
      units: VrvIndoor[];
      cooling: number;
      heating: number;
    } | null;
    if (!found) continue;
    solutions.push({
      outdoor,
      assignments: rooms.map((room, index) => ({
        roomId: room.id,
        indoor: found.units[index],
        coolingW: found.units[index].nominalCoolingW,
        heatingW: found.units[index].nominalHeatingW,
      })),
      requiredW,
      connectedCoolingW: found.cooling,
      connectedHeatingW: found.heating,
      connectionRatio: (found.cooling / outdoor.coolingW) * 100,
    });
  }
  return solutions;
}
