import { expect, it } from "vitest";
import { addRectangle, createProject } from "../project";
import {
  findDuctCollisions,
  ductScenePaths,
  type DuctScenePath,
} from "./collisions";
import type { Project } from "@/schemas/project";
import { insertPlenum } from "./attached-plenums";
import { validateProject } from "../validation";
import { placeMachineOnPlan } from "./graphic-installation";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";
import { createDuctFromEndpoints } from "./routes";
import { placeSupplyPlenum } from "./placement";
import { drywallGeometry } from "../geometry/drywall";

function fixture() {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 12,
    length: 10,
    height: 4,
    name: "Locale",
  });
}
const point = (x: number, y: number, elevationM = 2) => ({ x, y, elevationM });
function hose(
  p: Project,
  id = "hose",
  points = [point(1, 2), point(9, 2)],
): DuctScenePath {
  return {
    id,
    entityId: id,
    floorId: p.floors[0].id,
    terminalId: null,
    points,
    flexible: true,
    diameterMm: 200,
    radiusM: 0.1,
    startIds: [],
    endIds: [],
  };
}

it("keeps an unobstructed hose clear and checks its full radius against a thin rotated pillar", () => {
  const p = fixture(),
    path = hose(p);
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  p.pillars = [
    {
      id: "pillar",
      floorId: p.floors[0].id,
      position: { x: 5.013, y: 2.07 },
      widthMm: 20,
      depthMm: 20,
      heightMm: 4000,
      rotation: Math.PI / 4,
      locked: false,
    },
  ];
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    "pillar",
  );
  p.pillars[0].position.y = 2.2;
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  p.pillars[0].position.y = 2.07;
  p.pillars[0].heightMm = 1000;
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  p.pillars[0].heightMm = 4000;
  p.pillars[0].floorId = "other-floor";
  expect(findDuctCollisions(p, [path]).size).toBe(0);
});

it("marks both crossing hoses, clears them after separation, and respects their vertical separation", () => {
  const p = fixture(),
    a = hose(p),
    b = hose(p, "other", [point(5, 1), point(5, 4)]);
  const collisions = findDuctCollisions(p, [a, b]);
  expect(collisions.get(a.id)?.withIds).toContain(b.id);
  expect(collisions.get(b.id)?.withIds).toContain(a.id);
  b.points = b.points.map((point) => ({ ...point, elevationM: 2.3 }));
  expect(findDuctCollisions(p, [a, b]).size).toBe(0);
  b.points = [point(10, 1), point(10, 4)];
  expect(findDuctCollisions(p, [a, b]).size).toBe(0);
});

it("flags a wall but permits a measured opening of adequate size", () => {
  const p = fixture(),
    path = hose(p);
  p.walls.push({
    ...p.walls[0],
    id: "middle-wall",
    start: { x: 5, y: 1 },
    end: { x: 5, y: 6 },
    thickness: 0.2,
    height: 4,
  });
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    "middle-wall",
  );
  p.openings.push({
    id: "door",
    floorId: p.floors[0].id,
    wallId: "middle-wall",
    type: "door",
    offsetM: 0.5,
    widthM: 1,
    heightM: 2.5,
    sillHeightM: null,
  });
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  p.openings[0].heightM = 1.9;
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    "middle-wall",
  );
});

it("checks the real rectangular section of another duct rather than an oversized surrounding cylinder", () => {
  const p = fixture(),
    rigid = hose(p, "rigid", [point(3, 2), point(8, 2)]);
  rigid.flexible = false;
  rigid.duct = {
    id: rigid.id,
    systemId: "system",
    plenumId: "plenum",
    terminalId: null,
    branchId: null,
    kind: "rigid",
    shape: "rectangle",
    widthMm: 1000,
    heightMm: 200,
    diameterMm: null,
    routing: "manual",
    waypoints: [],
    decisionOrigin: "manual",
    locked: false,
  };
  const flexible = hose(p, "hose", [point(3, 2.3), point(8, 2.3)]);
  flexible.radiusM = 0.05;
  flexible.diameterMm = 100;
  expect(findDuctCollisions(p, [flexible, rigid]).size).toBe(0);
  flexible.points = [point(3, 2.13), point(8, 2.13)];
  expect(
    findDuctCollisions(p, [flexible, rigid]).get(flexible.id)?.withIds,
  ).toContain(rigid.id);
});

it("keeps a drywall cavity empty while flagging its actual outer skin", () => {
  const p = fixture(),
    wall = p.walls[0];
  wall.drywall = { roomId: p.rooms[0].id, offsetM: 0.4 };
  const cavity = drywallGeometry(p, wall)!;
  const start = {
    x: (cavity.front.start.x + cavity.back.start.x) / 2,
    y: (cavity.front.start.y + cavity.back.start.y) / 2,
  };
  const end = {
    x: (cavity.front.end.x + cavity.back.end.x) / 2,
    y: (cavity.front.end.y + cavity.back.end.y) / 2,
  };
  const at = (t: number) =>
    point(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t);
  const path = hose(p, "hose", [at(0.2), at(0.8)]);
  path.radiusM = 0.05;
  path.diameterMm = 100;
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  path.points = path.points.map((p) => ({
    ...p,
    x: p.x + cavity.normal.x * 0.19,
    y: p.y + cavity.normal.y * 0.19,
  }));
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    wall.id,
  );
});

it("ignores only contact at its own collar, while detecting later reentry into the attached plenum", () => {
  let p = fixture();
  p = insertPlenum(p, p.rooms[0].id, { x: 0.89, y: 2 });
  const plenum = p.plenums[0];
  Object.assign(plenum, {
    rotation: Math.PI / 2,
    heightMm: 1000,
    elevationM: 2,
  });
  const path = hose(p);
  path.startIds = [plenum.id];
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  path.points = [
    point(1, 2),
    point(3, 2),
    point(3, 4),
    point(0.5, 4, 1.7),
    point(0.5, 2, 1.7),
    point(1.5, 2, 1.7),
  ];
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    plenum.id,
  );
});

it("permits hoses above a suspended ceiling but reports penetration of it and the roof", () => {
  const p = fixture();
  p.rooms[0].ceilingHeightM = 2.4;
  const path = hose(p, "hose", [point(1, 2, 3), point(9, 2, 3)]);
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  path.points = path.points.map((point) => ({ ...point, elevationM: 2.45 }));
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    `ceiling:${p.rooms[0].id}`,
  );
  path.points = path.points.map((point) => ({ ...point, elevationM: 3.95 }));
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    `roof:${p.rooms[0].id}`,
  );
});

it("reports the same saved-duct collision in the project checks and the scene", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 4;
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = createDuctFromEndpoints(
    p,
    p.airTerminals[0].id,
    p.hvacSystems[0].id,
  ).project;
  const paths = ductScenePaths(p),
    path = paths.find((path) => path.flexible)!;
  const point = path.points[Math.floor(path.points.length / 2)];
  p.pillars = [
    {
      id: "obstacle",
      floorId: path.floorId,
      position: point,
      widthMm: 600,
      depthMm: 600,
      heightMm: 4000,
      rotation: 0,
      locked: false,
    },
  ];
  expect(findDuctCollisions(p, paths).get(path.id)?.withIds).toContain(
    "obstacle",
  );
  expect(validateProject(p)).toContainEqual(
    expect.objectContaining({
      code: "ductCollision",
      status: "invalid",
      entityId: path.id,
    }),
  );
});

it("does not invent a second machine body for a fan-coil air-system binding", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  const path = hose(p, "hose", [point(2, 3, 3.8), point(4, 3, 3.8)]);
  const unit = p.hvacSystems[0].indoorUnits[0];
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    unit.id,
  );
  p.hvacSystems[0].fanCoilId = "fan-coil";
  expect(findDuctCollisions(p, [path]).size).toBe(0);
});
