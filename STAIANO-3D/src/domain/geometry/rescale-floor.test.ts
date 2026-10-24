import { expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { sizeRadiators } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { rescaleFloor } from "./rescale-floor";
import { distance, projection } from "./primitives";

it("recalibration updates geometry and wall placement while retaining physical dimensions and heights", () => {
  let p = createProject("Nuovo progetto", 35);
  p.projectSettings.externalWallThicknessM = 0.3;
  p = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 3.1,
    name: "Studio",
  });
  const room = p.rooms[0];
  p = applyRadiatorSolution(
    p,
    room.id,
    sizeRadiators(
      room.designLoadW,
      radiatorProducts.filter(
        (v) => v.manufacturer === "Global" && v.family === "VIP",
      ),
      50,
      { manufacturer: "Global", family: "VIP", numberOfRadiators: 1 },
    )[0],
    null,
  );
  p.floors[0].background = {
    dataUrl: "data:image/png;base64,eA==",
    widthPx: 100,
    heightPx: 100,
    metersPerPixel: 0.1,
    origin: { x: 0, y: 0 },
    opacity: 0.5,
    filename: "reference.png",
  };
  const before = p.radiators[0];
  const wall = p.walls.find((w) => w.id === before.wallId)!;
  const oldNormal = distance(
    before.position,
    projection(before.position, wall.start, wall.end),
  );
  const next = rescaleFloor(p, p.floors[0].id, 2, { x: 0, y: 0 });
  const after = next.radiators[0],
    nextWall = next.walls.find((w) => w.id === wall.id)!;
  expect([after.id, after.widthMm, after.heightMm, after.depthMm]).toEqual([
    before.id,
    before.widthMm,
    before.heightMm,
    before.depthMm,
  ]);
  expect(
    distance(
      after.position,
      projection(after.position, nextWall.start, nextWall.end),
    ),
  ).toBeCloseTo(oldNormal);
  expect(next.rooms[0].heightM).toBe(3.1);
  expect(next.rooms[0].netAreaM2).toBeCloseTo(8.7 * 7.9);
  expect(next.rooms[0].designLoadW).toBeCloseTo(
    next.rooms[0].netAreaM2 * 3.1 * 35,
  );
  expect(next.floors[0].background!.metersPerPixel).toBe(0.2);
});
