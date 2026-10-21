import type { Project } from "@/schemas/project";
import { drywallGeometry } from "../geometry/drywall";

export function wallCavityGeometry(
  project: Project,
  terminal: Project["airTerminals"][number],
) {
  const wall = project.walls.find(
    (w) => w.id === terminal.wallId && w.floorId === terminal.floorId,
  );
  return terminal.mounting === "wall" &&
    wall?.drywall?.roomId === terminal.roomId
    ? drywallGeometry(project, wall)
    : null;
}
export function wallCavityPolygon(
  project: Project,
  terminal: Project["airTerminals"][number],
) {
  return wallCavityGeometry(project, terminal)?.polygon ?? null;
}
export function wallCavityPolygons(project: Project, floorId: string) {
  return project.walls
    .filter((w) => w.floorId === floorId)
    .flatMap((w) => {
      const geometry = drywallGeometry(project, w);
      return geometry ? [geometry.polygon] : [];
    });
}
