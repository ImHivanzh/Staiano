import { expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  recomputeProject,
  updateRoom,
} from "../project";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";
import {
  ceilingBandPolygon,
  ceilingFrontPose,
  ceilingHeightAt,
  roofHeightAt,
  roofPlanes,
  syncCeilingTerminals,
  validateCeilingBand,
  calculateRoomThermal,
} from "./ceilings";
import { duplicateSelection, translateSelection } from "./selection";
import { projectSchema } from "@/schemas/project";
import { roomWallSpan } from "./placement";
import { area, bounds } from "./primitives";
import { movePlacedDevice } from "./move-device";

function fixture() {
  let project = createProject("Nuovo progetto", 35);
  project = addRectangle(project, project.floors[0].id, {
    width: 8,
    length: 12,
    height: 3,
    name: "Sala",
  });
  const room = project.rooms[0];
  const wall = project.walls.find((w) => w.id === room.wallIds[1])!;
  room.roof = { ridgeWallId: wall.id, ridgeHeightM: 4 };
  room.ceilingHeightM = 2.8;
  room.ceilingBands = [
    {
      id: "band",
      name: "Fascia destra",
      wallId: wall.id,
      offsetM: 0,
      lengthM: roomWallSpan(room, wall)!.lengthM,
      depthM: 0.8,
      elevationM: 2.4,
    },
  ];
  return project;
}

it("creates the two real roof slopes with a central ridge and both eaves at wall height", () => {
  const project = fixture(),
    room = project.rooms[0];
  const box = bounds(room.polygon);
  expect(roofHeightAt(project, room, room.centroid)).toBeCloseTo(4);
  expect(
    roofHeightAt(project, room, { x: box.minX, y: room.centroid.y }),
  ).toBeCloseTo(3);
  expect(
    roofHeightAt(project, room, { x: box.maxX, y: room.centroid.y }),
  ).toBeCloseTo(3);
  expect(
    roofHeightAt(project, room, {
      x: (box.minX + room.centroid.x) / 2,
      y: room.centroid.y,
    }),
  ).toBeCloseTo(3.5);
  const planes = roofPlanes(project, room);
  expect(planes).toHaveLength(2);
  expect(planes.reduce((sum, p) => sum + area(p), 0)).toBeCloseTo(
    area(room.polygon),
  );
  expect(projectSchema.safeParse(project).success).toBe(true);
});

it("models the lower band and higher central ceiling and rejects overlapping or overflowing bands", () => {
  const project = fixture(),
    room = project.rooms[0],
    band = room.ceilingBands![0];
  expect(() => validateCeilingBand(project, room, band)).not.toThrow();
  expect(ceilingHeightAt(project, room, { x: 7.6, y: 6 })).toBeCloseTo(2.4);
  expect(ceilingHeightAt(project, room, { x: 4, y: 6 })).toBeCloseTo(2.8);
  expect(() =>
    validateCeilingBand(project, room, { ...band, id: "overlap" }),
  ).toThrow(/sovrapporsi/);
  expect(() =>
    validateCeilingBand(project, room, { ...band, depthM: 50 }),
  ).toThrow(/rientrare/);
  expect(recomputeProject(project).rooms[0]).toMatchObject({
    roof: room.roof,
    ceilingBands: room.ceilingBands,
  });
});

it("places and moves a real grille on the vertical front and follows changes to its height", () => {
  let project = addGuidedTerminal(guidedProjectFixture(), 1000, "EDLH", "wall");
  const room = project.rooms[0],
    terminal = project.airTerminals[0];
  const wall = project.walls.find((w) => w.id === room.wallIds[1])!;
  room.ceilingHeightM = 2.6;
  room.ceilingBands = [
    {
      id: "front",
      name: "Fascia",
      wallId: wall.id,
      offsetM: 0,
      lengthM: roomWallSpan(room, wall)!.lengthM,
      depthM: 0.8,
      elevationM: 2.2,
    },
  ];
  project.airTerminals[0] = {
    ...terminal,
    ...ceilingFrontPose(
      project,
      { ...terminal, ceilingBandId: "front" },
      { x: 7, y: 3 },
      2,
    ),
  };
  expect(project.airTerminals[0].wallId).toBeNull();
  project = syncCeilingTerminals(
    movePlacedDevice(project, terminal.id, { x: 7.1, y: 4 }),
  );
  expect(project.airTerminals[0].ceilingBandId).toBe("front");
  expect(project.airTerminals[0].elevationM).toBeGreaterThan(2.2);
  expect(projectSchema.safeParse(project).success).toBe(true);
});

it("moves and duplicates bands and roof references with their room", () => {
  const project = fixture(),
    room = project.rooms[0];
  const before = ceilingBandPolygon(project, room, room.ceilingBands![0]);
  const moved = translateSelection(project, [{ kind: "room", id: room.id }], {
    x: 15,
    y: 0,
  });
  const after = ceilingBandPolygon(
    moved,
    moved.rooms[0],
    moved.rooms[0].ceilingBands![0],
  );
  expect(after[0].x).toBeCloseTo(before[0].x + 15);
  const copied = duplicateSelection(project, [{ kind: "room", id: room.id }], {
    x: 15,
    y: 0,
  });
  const copy = copied.rooms.find((r) => r.id !== room.id)!;
  expect(copy.ceilingBands![0].id).not.toBe(room.ceilingBands![0].id);
  expect(copy.wallIds).toContain(copy.roof!.ridgeWallId);
  expect(projectSchema.safeParse(copied).success).toBe(true);
});

it("integrates the pitched roof volume and subtracts the actual lowered ceiling", () => {
  const project = fixture(),
    room = project.rooms[0];
  const roofOnly = { ...room, ceilingHeightM: null, ceilingBands: undefined };
  expect(calculateRoomThermal(project, roofOnly).volumeM3).toBeCloseTo(
    8 * 12 * 3.5,
  );
  expect(calculateRoomThermal(project, room).volumeM3).toBeCloseTo(
    8 * 12 * 2.8 - 12 * 0.8 * 0.4,
  );
  expect(calculateRoomThermal(project, room).designLoadW).toBeCloseTo(
    calculateRoomThermal(project, room).volumeM3 * 35,
  );
});

it("uses the finished ceiling height for a flat room, including after reload and removal", () => {
  let project = fixture();
  const room = project.rooms[0];
  project = updateRoom(project, room.id, {
    roof: undefined,
    ceilingBands: undefined,
    ceilingHeightM: 2.5,
  });
  expect(project.rooms[0].volumeM3).toBeCloseTo(8 * 12 * 2.5);
  expect(project.rooms[0].designLoadW).toBeCloseTo(8 * 12 * 2.5 * 35);
  project = recomputeProject(project);
  expect(project.rooms[0].volumeM3).toBeCloseTo(8 * 12 * 2.5);
  project = updateRoom(project, room.id, { ceilingHeightM: null });
  expect(project.rooms[0].volumeM3).toBeCloseTo(8 * 12 * 3);
});

it("keeps a wall terminal face below the plasterboard, never in the void above it", async () => {
  const { syncCeilingTerminals } = await import("./ceilings");
  const base = addGuidedTerminal(guidedProjectFixture(), 1000);
  const room = base.rooms[0];
  room.ceilingHeightM = 2.0;
  const wall = { ...base.airTerminals[0], mounting: "wall" as const, ceilingBandId: undefined, elevationM: 2.2, heightMm: 80 };
  const synced = syncCeilingTerminals({ ...base, airTerminals: [wall] });
  expect(synced.airTerminals[0].elevationM).toBeCloseTo(2.0 - 0.04 - 0.05, 6);
  const low = syncCeilingTerminals({ ...base, airTerminals: [{ ...wall, elevationM: 1.5 }] });
  expect(low.airTerminals[0].elevationM).toBe(1.5);
});
