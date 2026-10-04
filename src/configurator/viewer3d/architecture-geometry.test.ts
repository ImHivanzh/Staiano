import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import {
  architecturalWallHeight,
  measuredOpenings,
  roomWallSpan,
  wallPanels,
  type ArchitecturalOpening,
} from "./architecture-geometry";

function setup() {
  const project = createProject();
  return addRectangle(project, project.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Soggiorno",
  });
}
const openingFor = (
  p: ReturnType<typeof setup>,
  values: Partial<ArchitecturalOpening> = {},
): ArchitecturalOpening => ({
  id: "opening",
  wallId: p.walls[0].id,
  floorId: p.floors[0].id,
  offsetM: 0.5,
  widthM: 1.2,
  heightM: 1.3,
  type: "window",
  sillHeightM: null,
  ...values,
});

describe("realistic architecture uses measured geometry", () => {
  it("leaves windows with unknown sill uncut, but cuts doors from floor", () => {
    const p = setup();
    expect(measuredOpenings(p.walls[0], [openingFor(p)], 2.7)).toEqual([]);
    const door = measuredOpenings(
      p.walls[0],
      [openingFor(p, { type: "door", heightM: 2.1 })],
      2.7,
    )[0];
    expect(door.bottom).toBe(0);
    expect(door.top).toBe(2.1);
    expect(door.headClipped).toBe(false);
  });
  it("removes exact measured window area and keeps its sill masonry", () => {
    const p = setup();
    const holes = measuredOpenings(
      p.walls[0],
      [openingFor(p, { sillHeightM: 0.9 })],
      2.7,
    );
    const panels = wallPanels(4.2, 2.7, holes);
    const area = panels.reduce(
      (sum, panel) =>
        sum + (panel.right - panel.left) * (panel.top - panel.bottom),
      0,
    );
    expect(area).toBeCloseTo(4.2 * 2.7 - 1.2 * 1.3, 10);
    expect(
      panels.some((r) => r.left === 0.5 && r.bottom === 0 && r.top === 0.9),
    ).toBe(true);
  });
  it("cutaway clips door geometry, never draws a false lowered lintel", () => {
    const p = setup();
    const holes = measuredOpenings(
      p.walls[0],
      [openingFor(p, { type: "door", heightM: 2.1 })],
      0.72,
    );
    expect(holes[0].top).toBe(0.72);
    expect(holes[0].headClipped).toBe(true);
    const panels = wallPanels(4.2, 0.72, holes);
    expect(
      panels.reduce(
        (sum, r) => sum + (r.right - r.left) * (r.top - r.bottom),
        0,
      ),
    ).toBeCloseTo((4.2 - 1.2) * 0.72, 10);
  });
  it("keeps longest shared-room height and only clips isolated wall span", () => {
    const p = setup();
    expect(
      architecturalWallHeight(
        p.walls[0],
        [...p.rooms, { ...p.rooms[0], heightM: 3.1 }],
        2.6,
      ),
    ).toBe(3.1);
    expect(
      architecturalWallHeight({ ...p.walls[0], height: 2.2 }, p.rooms, 2.6),
    ).toBe(2.2);
    const wall = { ...p.walls[0], end: { x: 10, y: 0 }, thickness: 0.2 };
    const room = {
      ...p.rooms[0],
      polygon: [
        { x: 0.1, y: 0.1 },
        { x: 4.1, y: 0.1 },
        { x: 4.1, y: 3.7 },
        { x: 0.1, y: 3.7 },
      ],
    };
    const span = roomWallSpan(wall, room);
    expect(span.start).toBeCloseTo(0);
    expect(span.end).toBeCloseTo(4.2);
  });
  it("unites overlapping holes without duplicate removed area", () => {
    const p = setup();
    const holes = measuredOpenings(
      p.walls[0],
      [
        openingFor(p, { type: "door", widthM: 1, heightM: 2 }),
        openingFor(p, {
          id: "b",
          type: "door",
          offsetM: 1,
          widthM: 1,
          heightM: 2,
        }),
      ],
      2.7,
    );
    const panels = wallPanels(4.2, 2.7, holes);
    expect(
      panels.reduce(
        (sum, r) => sum + (r.right - r.left) * (r.top - r.bottom),
        0,
      ),
    ).toBeCloseTo(4.2 * 2.7 - 1.5 * 2, 10);
  });
});
