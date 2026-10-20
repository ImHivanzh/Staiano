import type { Project, Room } from "@/schemas/project";
/** Underside of the suspended ceiling when present, otherwise the structural ceiling. */
export const roomCeilingHeightM = (room: Pick<Room, "heightM" | "ceilingHeightM">) =>
  room.ceilingHeightM ?? room.heightM;
/** Explicit initial installation choice; not a manufacturer-certified clearance. */
export function splitCenterElevationM(
  room: Room,
  unit: Project["hvacSystems"][number]["indoorUnits"][number],
) {
  return roomCeilingHeightM(room) - 0.1 - unit.heightMm / 2000;
}
