import type { Project, Room } from "@/schemas/project";
/** Explicit initial installation choice; not a manufacturer-certified clearance. */
export function splitCenterElevationM(
  room: Room,
  unit: Project["hvacSystems"][number]["indoorUnits"][number],
) {
  return room.heightM - 0.1 - unit.heightMm / 2000;
}
