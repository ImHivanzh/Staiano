import { describe, expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  resizeWallRunInternal,
} from "@/domain/project";
import {
  roomMeasuredSides,
  roomRectSides,
  wallMeasuredLength,
} from "./dimensions";
import { wallRun, wallRunMeasuredLength } from "./wall-runs";
import { splitWall } from "./wall-commands";

const fixture = () => {
  const p = createProject("Quote");
  p.projectSettings.externalWallThicknessM = 0.3;
  return addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Soggiorno",
  });
};
const longerSide = (p: ReturnType<typeof fixture>) =>
  p.walls.find(
    (w) =>
      Math.abs(w.start.y - w.end.y) < 1e-6 &&
      Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) > 5,
  )!;

describe("modalità di quotatura", () => {
  it("di default i muri quotano la misura interna utile", () => {
    const p = fixture();
    expect(p.projectSettings.dimensionMode).toBe("internal");
    const lengths = p.walls.map((w) => wallMeasuredLength(p, w)).sort();
    expect(lengths[0]).toBeCloseTo(4, 5);
    expect(lengths[2]).toBeCloseTo(5, 5);
  });
  it("asse ed esterna derivano dallo stesso asse", () => {
    const p = fixture();
    const wall = p.walls.reduce((a, b) =>
      wallMeasuredLength(p, a, "axis") > wallMeasuredLength(p, b, "axis")
        ? a
        : b,
    );
    expect(wallMeasuredLength(p, wall, "axis")).toBeCloseTo(5.3, 5);
    expect(wallMeasuredLength(p, wall, "external")).toBeCloseTo(5.6, 5);
  });
  it("le stanze rettangolari quotano i lati netti interni", () => {
    const p = fixture();
    const room = p.rooms[0];
    const sides = roomRectSides(room)!;
    expect(sides.width).toBeCloseTo(5, 5);
    expect(sides.length).toBeCloseTo(4, 5);
    const internal = roomMeasuredSides(p, room)!;
    expect(internal.width).toBeCloseTo(5, 5);
    expect(internal.length).toBeCloseTo(4, 5);
    const axis = roomMeasuredSides(p, room, "axis")!;
    expect(axis.width).toBeCloseTo(5.3, 5);
    expect(axis.length).toBeCloseTo(4.3, 5);
  });
});

describe("misura unica dei muri collineari", () => {
  it("due segmenti adiacenti sullo stesso asse contano come una misura", () => {
    let p = fixture();
    const wall = longerSide(p);
    p = splitWall(p, wall.id, 2.65);
    expect(p.walls).toHaveLength(5);
    const run = wallRun(p, wall.id)!;
    expect(run.walls).toHaveLength(2);
    expect(wallRunMeasuredLength(p, wall.id, "internal")).toBeCloseTo(5, 5);
    // Le singole metà non sono più la quota della fila.
    expect(
      wallMeasuredLength(
        p,
        p.walls.find((item) => item.id === wall.id)!,
        "internal",
      ),
    ).toBeLessThan(5);
  });
  it("la misura digitata è interna e dimensiona l'asse di tutta la fila", () => {
    let p = fixture();
    const wall = longerSide(p);
    p = splitWall(p, wall.id, 2.65);
    const next = resizeWallRunInternal(p, wall.id, 6);
    expect(wallRunMeasuredLength(next, wall.id, "internal")).toBeCloseTo(6, 4);
    expect(wallRun(next, wall.id)!.walls).toHaveLength(2);
    expect(next.rooms).toHaveLength(1);
    expect(next.rooms[0].geometryStatus).toBe("closed");
  });
  it("la correzione ripete la misura interna anche su più segmenti", () => {
    let p = fixture();
    const wall = longerSide(p);
    p = splitWall(p, wall.id, 2.65);
    p = splitWall(
      p,
      p.walls.find((item) => item.id === wall.id)!.id,
      1.5,
    );
    const next = resizeWallRunInternal(p, wall.id, 4.2);
    expect(wallRunMeasuredLength(next, wall.id, "internal")).toBeCloseTo(4.2, 4);
  });
  it("muri paralleli su rette diverse o perpendicolari restano separati", () => {
    const p = fixture();
    expect(wallRun(p, p.walls[0].id)!.walls).toHaveLength(1);
    expect(wallRun(p, p.walls[1].id)!.walls).toHaveLength(1);
  });
});
