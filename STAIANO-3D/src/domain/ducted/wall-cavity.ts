import type { Project } from "@/schemas/project";
import { drywallGeometry } from "../geometry/drywall";
import { drywallSideForRoom, drywallSides } from "../geometry/drywall-sides";

export function wallCavityGeometry(
  project: Project,
  terminal: Project["airTerminals"][number],
) {
  const wall = project.walls.find(
    (w) => w.id === terminal.wallId && w.floorId === terminal.floorId,
  );
  return terminal.mounting === "wall" &&
    wall &&
    drywallSideForRoom(wall, terminal.roomId)
    ? drywallGeometry(project, wall, terminal.roomId)
    : null;
}
export function wallCavityPolygon(
  project: Project,
  terminal: Project["airTerminals"][number],
) {
  return wallCavityGeometry(project, terminal)?.polygon ?? null;
}
export function wallCavityPolygons(
  project: Project,
  floorId: string,
  roomId?: string,
) {
  return project.walls
    .filter((w) => w.floorId === floorId)
    .flatMap((wall) =>
      drywallSides(wall)
        .filter((side) => !roomId || side.roomId === roomId)
        .flatMap((side) => {
          const geometry = drywallGeometry(project, wall, side.roomId);
          return geometry ? [geometry.polygon] : [];
        }),
    );
}
