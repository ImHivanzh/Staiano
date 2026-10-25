import type { Project, Room } from "@/schemas/project";
import { footprintCorners } from "../geometry/footprint";
import { minimumCeilingHeightM } from "../geometry/ceilings";
/** Underside of the suspended ceiling when present, otherwise the structural ceiling. */
export const roomCeilingHeightM = (
  room: Pick<Room, "heightM" | "ceilingHeightM">,
) => room.ceilingHeightM ?? room.heightM;
type WallUnit = Pick<
  Project["hvacSystems"][number]["indoorUnits"][number],
  "position" | "rotation" | "widthMm" | "heightMm" | "depthMm"
> &
  Partial<
    Pick<Project["hvacSystems"][number]["indoorUnits"][number], "mounting">
  >;
function unitCeiling(project: Project, room: Room, unit: WallUnit) {
  return minimumCeilingHeightM(
    project,
    room,
    footprintCorners(
      unit.position,
      unit.widthMm / 1000,
      unit.depthMm / 1000,
      unit.rotation,
    ),
  );
}
/** Explicit initial installation choice; not a manufacturer-certified clearance. */
export function splitCenterElevationM(
  room: Room,
  unit: WallUnit,
  project: Project,
) {
  return (
    unitCeiling(project, room, unit) -
    (unit.mounting === "ceiling"
      ? unit.heightMm / 2000
      : 0.1 + unit.heightMm / 2000)
  );
}
export function indoorUnitFitsBelowCeiling(
  project: Project,
  room: Room,
  unit: WallUnit,
) {
  return (
    unit.heightMm / 1000 + (unit.mounting === "ceiling" ? 0 : 0.1) <=
    unitCeiling(project, room, unit) + 1e-7
  );
}
