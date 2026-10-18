import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import {
  roomMeasuredSides,
  roomRectSides,
  wallMeasuredLength,
} from "./dimensions";

const fixture = () => {
  const p = createProject("Quote");
  return addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Soggiorno",
  });
};

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
