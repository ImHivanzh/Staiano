import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { cameraCutWalls, sceneFrame } from "./scene-layout";
import { applySplitSystem } from "@/domain/air-conditioning/apply";
import { projectOutdoorUnits } from "@/domain/hydronic/placement";

describe("realistic scene framing and directional section", () => {
  it("include le esterne split lontane e rialzate nell’inquadratura condivisa col PDF", () => {
    const empty = createProject();
    let p = addRectangle(empty, empty.floors[0].id, {
      width: 4,
      length: 3,
      height: 3,
      name: "Stanza",
    });
    p = applySplitSystem(p, [p.rooms[0].id], "Daikin", null);
    const unit = p.hvacSystems[0].outdoorUnit!;
    unit.position = { x: 28, y: -12 };
    unit.elevationM = 7;
    unit.rotation = Math.PI / 4;
    const frame = sceneFrame(p.walls, p.rooms, 3, projectOutdoorUnits(p));
    expect(frame.maxX).toBeGreaterThan(28 + unit.widthMm / 2000);
    expect(frame.minZ).toBeLessThan(-12 - unit.depthMm / 2000);
    expect(frame.height).toBe(7 + unit.heightMm / 2000);
  });
  it("preserves rear height and changes the foreground after orbiting to the opposite side", () => {
    const empty = createProject();
    const p = addRectangle(empty, empty.floors[0].id, {
      width: 4,
      length: 3,
      height: 3.1,
      name: "Ambiente",
    });
    const first = cameraCutWalls(p.walls, p.rooms, { x: 20, z: 20 }, false);
    const opposite = cameraCutWalls(
      p.walls,
      p.rooms,
      { x: -20, z: -20 },
      false,
    );
    expect(first.size).toBe(2);
    expect(opposite.size).toBe(2);
    expect([...first].filter((id) => opposite.has(id))).toEqual([]);
    expect(cameraCutWalls(p.walls, p.rooms, { x: 20, z: 20 }, true).size).toBe(
      4,
    );
  });
  it("fits tall measured walls rather than using a fixed default height", () => {
    const empty = createProject();
    const p = addRectangle(empty, empty.floors[0].id, {
      width: 2,
      length: 2,
      height: 9,
      name: "Vano alto",
    });
    p.walls[0].height = 10;
    const frame = sceneFrame(p.walls, p.rooms, 2.7);
    expect(frame.height).toBe(10);
    expect(frame.minX).toBeLessThan(Math.min(...p.walls.map((w) => w.start.x)));
    expect(frame.maxX).toBeGreaterThan(
      Math.max(...p.walls.map((w) => w.start.x)),
    );
  });
});
