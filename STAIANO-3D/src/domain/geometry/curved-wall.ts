import type { Point, Project } from "@/schemas/project";
import { newId, recomputeProject } from "@/domain/project";
import { distance } from "./primitives";

/** Circular arc through three points; exact endpoints keep adjoining rooms closed. */
export function curvedWallPoints(
  start: Point,
  end: Point,
  through: Point,
): Point[] {
  if (
    ![start, end, through].every((p) =>
      [p.x, p.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 10000),
    )
  )
    throw Error("Coordinate della curva non valide.");
  if (distance(start, end) < 0.05)
    throw Error("Gli estremi della curva devono distare almeno 5 cm.");
  const bx = end.x - start.x,
    by = end.y - start.y,
    cx = through.x - start.x,
    cy = through.y - start.y;
  const determinant = 2 * (bx * cy - by * cx);
  if (Math.abs(determinant) < 1e-5)
    throw Error(
      "Scegli un punto di curvatura fuori dalla linea fra gli estremi.",
    );
  const b2 = bx * bx + by * by,
    c2 = cx * cx + cy * cy;
  const center = {
    x: start.x + (cy * b2 - by * c2) / determinant,
    y: start.y + (bx * c2 - cx * b2) / determinant,
  };
  const radius = distance(start, center),
    a = Math.atan2(start.y - center.y, start.x - center.x);
  const tau = Math.PI * 2,
    positive = (value: number) => ((value % tau) + tau) % tau;
  const endAngle = positive(Math.atan2(end.y - center.y, end.x - center.x) - a);
  const throughAngle = positive(
    Math.atan2(through.y - center.y, through.x - center.x) - a,
  );
  const sweep = throughAngle <= endAngle ? endAngle : endAngle - tau;
  let segments = Math.max(
    2,
    Math.ceil(
      Math.abs(sweep) / (2 * Math.acos(Math.max(-1, 1 - 0.002 / radius))),
    ),
  );
  if (!Number.isFinite(segments) || segments > 512)
    throw Error("Curva troppo estesa: scegli estremi o curvatura più vicini.");
  while (
    segments > 2 &&
    2 * radius * Math.sin(Math.abs(sweep) / (2 * segments)) < 0.05
  )
    segments--;
  if (2 * radius * Math.sin(Math.abs(sweep) / (2 * segments)) < 0.05)
    throw Error(
      "Curva troppo corta per i muri: aumenta la distanza tra i punti.",
    );
  const points = Array.from({ length: segments + 1 }, (_, i) => ({
    x: center.x + radius * Math.cos(a + (sweep * i) / segments),
    y: center.y + radius * Math.sin(a + (sweep * i) / segments),
  }));
  points[0] = start;
  points[segments] = end;
  if (points.some((p) => Math.abs(p.x) > 10000 || Math.abs(p.y) > 10000))
    throw Error("La curva esce dai limiti della planimetria.");
  return points;
}

export function addCurvedWall(
  project: Project,
  floorId: string,
  start: Point,
  end: Point,
  through: Point,
): Project {
  if (!project.floors.some((f) => f.id === floorId))
    throw Error("Piano inesistente.");
  const points = curvedWallPoints(start, end, through);
  const curveId = newId();
  if (project.walls.length + points.length - 1 > 5000)
    throw Error("La planimetria supera il limite di 5000 tratti di muro.");
  // shortcut: curves use wall chords for existing geometry/export compatibility; add analytic arcs for fabrication-grade curved walls.
  return recomputeProject({
    ...project,
    walls: [
      ...project.walls,
      ...points
        .slice(1)
        .map((end, index) => ({
          id: newId(),
          curveId,
          floorId,
          start: points[index],
          end,
          type: "INTERNO" as const,
          thickness: project.projectSettings.internalWallThicknessM,
          height: null,
          locked: false,
        })),
    ],
  });
}
