import { createProject, newId, recomputeProject } from "../src/domain/project";
import type { Wall } from "../src/schemas/project";
import { radiatorProducts } from "../src/domain/catalogs/radiators";
import { sizeRadiators } from "../src/domain/radiators/size";
import { applyRadiatorSolution } from "../src/domain/radiators/apply";

export function largeProjectFixture() {
  let p = createProject("Verifica 50 ambienti");
  const walls: Wall[] = [];
  for (let i = 0; i < 50; i++) {
    const x = (i % 10) * 7,
      y = Math.floor(i / 10) * 6;
    const points = [
      { x, y },
      { x: x + 5.3, y },
      { x: x + 5.3, y: y + 4.3 },
      { x, y: y + 4.3 },
    ];
    points.forEach((start, j) =>
      walls.push({
        id: newId(),
        floorId: p.floors[0].id,
        start,
        end: points[(j + 1) % 4],
        thickness: 0.3,
        height: null,
        type: "ESTERNO",
        locked: false,
      }),
    );
  }
  p = recomputeProject({ ...p, walls });
  p.rooms = p.rooms.map((room, i) => ({ ...room, name: `Ambiente ${i + 1}` }));
  const variants = radiatorProducts.filter(
    (v) => v.manufacturer === "Global" && v.family === "VIP",
  );
  const solution = sizeRadiators(p.rooms[0].designLoadW, variants, 50, {
    manufacturer: "Global",
    family: "VIP",
    numberOfRadiators: 2,
  })[0];
  for (const room of p.rooms)
    p = applyRadiatorSolution(p, room.id, solution, null);
  return p;
}
