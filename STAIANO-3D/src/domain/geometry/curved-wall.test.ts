import { expect, it } from "vitest";
import { addCurvedWall, curvedWallPoints } from "./curved-wall";
import { createProject } from "@/domain/project";
import { decodeProject, encodeProject } from "@/services/project/format";

it("draws either side of a circular arc with exact endpoints and valid wall lengths", () => {
  const start = { x: 0, y: 0 },
    end = { x: 4, y: 0 };
  for (const side of [-1, 1]) {
    const points = curvedWallPoints(start, end, { x: 2, y: 2 * side });
    expect(points[0]).toEqual(start);
    expect(points.at(-1)).toEqual(end);
    expect(points.some((p) => p.y * side > 1.99)).toBe(true);
    for (const point of points)
      expect(Math.hypot(point.x - 2, point.y)).toBeCloseTo(2, 7);
    expect(
      points
        .slice(1)
        .every(
          (p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) >= 0.05,
        ),
    ).toBe(true);
  }
  expect(() => curvedWallPoints(start, end, { x: 2, y: 0 })).toThrow(
    /curvatura/,
  );
  expect(() => curvedWallPoints(start, end, { x: NaN, y: 2 })).toThrow(
    /Coordinate/,
  );
});

it("closes a curved room and preserves the geometry in saved projects", () => {
  let p = createProject();
  const floor = p.floors[0].id;
  p = addCurvedWall(p, floor, { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 2 });
  p = addCurvedWall(p, floor, { x: 4, y: 0 }, { x: 0, y: 0 }, { x: 2, y: -2 });
  expect(p.rooms).toHaveLength(1);
  expect(p.rooms[0].netAreaM2).toBeGreaterThan(10);
  expect(decodeProject(encodeProject(p)).walls).toEqual(p.walls);
});
