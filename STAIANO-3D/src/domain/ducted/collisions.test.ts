import { expect, it } from "vitest";
import { addRectangle, createProject } from "../project";
import {
  findDuctCollisions,
  ductScenePaths,
  type DuctScenePath,
} from "./collisions";
import type { Project } from "@/schemas/project";
import { addTerminalPlenum, insertPlenum } from "./attached-plenums";
import { validateProject } from "../validation";
import { placeMachineOnPlan } from "./graphic-installation";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";
import { createDuctFromEndpoints, ductRoute } from "./routes";
import { flexibleDuctCurve } from "./flexible-curve";
import { ceilingSurfaces, segmentHitsCeilingSurface } from "./ceiling-surfaces";
import { Vector3 } from "three";
import { placeSupplyPlenum } from "./placement";
import { drywallGeometry } from "../geometry/drywall";
import { ceilingBandPolygon, roofHeightAt } from "../geometry/ceilings";
import { roomWallSpan } from "../geometry/placement";
import { bodies } from "./duct-bodies";

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

it("places outdoor collision bodies around their saved centre elevation, like the 3D mesh", () => {
  const p = fixture();
  p.hvacSystems = [
    {
      id: "system",
      manufacturer: "Daikin",
      productId: "outdoor-test",
      roomIds: [],
      capacityW: null,
      airflowM3h: null,
      catalogVersion: "test",
      compatibilityStatus: "unverifiable",
      linearPlan: null,
      outdoorUnit: {
        id: "outdoor",
        floorId: p.floors[0].id,
        position: { x: -2, y: 3 },
        rotation: 0,
        widthMm: 1000,
        heightMm: 1200,
        depthMm: 400,
        elevationM: 2,
        mounting: "brackets",
        locked: false,
      },
      indoorUnits: [],
      type: "split",
    },
  ];
  const body = bodies(p, new Set([p.floors[0].id]), new Map()).find(
    (body) => body.deviceId === "outdoor",
  )!;
  expect(body.minZ).toBeCloseTo(1.4);
  expect(body.maxZ).toBeCloseTo(2.6);
  expect(body.center.y).toBe(2);
});
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

it("still checks obstacles along a flexible route whose bend radius is invalid", () => {
  const p = fixture(),
    path = hose(p, "tight-hose", [
      point(1, 2),
      point(1.1, 2),
      point(1.1, 2.1),
    ]);
  p.pillars = [
    {
      id: "pillar",
      floorId: p.floors[0].id,
      position: { x: 1.1, y: 2.05 },
      widthMm: 100,
      depthMm: 100,
      heightMm: 4000,
      rotation: 0,
      locked: false,
    },
  ];
  expect(flexibleDuctCurve(path.points, path.diameterMm)).toBeNull();
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    "pillar",
  );
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

it("keeps a flush ceiling plenum under the slab and connects it without collisions", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 2.7;
  p.rooms[0].ceilingHeightM = null;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p = createDuctFromEndpoints(
    p,
    p.airTerminals[0].id,
    p.hvacSystems[0].id,
  ).project;
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((pl) => pl.attachmentId === terminal.id)!;
  // Senza controsoffitto il plenum non ha vuoto: resta sotto il solaio e di
  // fianco alla bocchetta, così si vede e il tubo non attraversa il soffitto.
  expect(plenum.elevationM! + plenum.heightMm / 2000).toBeLessThanOrEqual(
    p.rooms[0].heightM + 1e-9,
  );
  expect(plenum.position).not.toEqual(terminal.position);
  expect(findDuctCollisions(p, ductScenePaths(p)).size).toBe(0);
});

it("reports a pillar that cannot clear the new insulated hose envelope", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 4;
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p.pillars = [
    {
      id: "obstacle",
      floorId: p.floors[0].id,
      position: { x: 2.95, y: 3.95 },
      widthMm: 100,
      depthMm: 100,
      heightMm: 4000,
      rotation: 0,
      locked: false,
    },
  ];
  const paths = ductScenePaths(p);
  expect(paths).toHaveLength(1);
  // The former bare hose fitted; 25 mm insulation now makes this exact collar approach too tight.
  expect(paths[0].radiusM).toBeCloseTo(paths[0].diameterMm / 2000 + .025);
  expect([...findDuctCollisions(p, paths).values()]).toEqual([
    expect.objectContaining({ withIds: ["obstacle"] }),
  ]);
});

it("keeps the ceiling terminal plenum in the void above a suspended ceiling", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 3.2;
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((pl) => pl.attachmentId === terminal.id)!;
  // Con il controsoffitto il plenum sta sopra la faccia della bocchetta.
  // La bocca del plenum e larga come la bocchetta: il corpo (149) si sposta
  // di (149 - larghezza bocchetta) / 2 verso il lato largo.
  const shift = (149 - terminal.heightMm) / 2000;
  expect(plenum.position.x).toBeCloseTo(
    terminal.position.x - Math.sin(terminal.rotation) * shift,
    9,
  );
  expect(plenum.position.y).toBeCloseTo(
    terminal.position.y + Math.cos(terminal.rotation) * shift,
    9,
  );
  expect(plenum.elevationM! - plenum.heightMm / 2000).toBeGreaterThanOrEqual(
    terminal.elevationM!,
  );
});

it("reports the same saved-duct collision in the project checks and the scene", () => {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 4;
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
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

it("detects the finite radius against a lowered-band vertical front while keeping its technical void empty", () => {
  const p = fixture(),
    room = p.rooms[0],
    wall = p.walls.find((w) => w.id === room.wallIds[0])!;
  const band = {
    id: "fascia-front",
    name: "Fascia",
    wallId: wall.id,
    offsetM: 1,
    lengthM: 8,
    depthM: 1,
    elevationM: 2.4,
  };
  room.ceilingBands = [band];
  const polygon = ceilingBandPolygon(p, room, band),
    a = polygon[3],
    b = polygon[2];
  const span = roomWallSpan(room, wall)!,
    nx = -(span.end.y - span.start.y) / span.lengthM,
    ny = (span.end.x - span.start.x) / span.lengthM;
  const line = (offset: number) =>
    [0.2, 0.8].map((t) =>
      point(
        a.x + (b.x - a.x) * t + nx * offset,
        a.y + (b.y - a.y) * t + ny * offset,
        2.8,
      ),
    );
  const path = hose(p, "front", line(0.05));
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    band.id,
  );
  path.points = line(0.11);
  expect(findDuctCollisions(p, [path]).size).toBe(0);
  path.points = line(-0.3);
  expect(findDuctCollisions(p, [path]).size).toBe(0);
});

it("detects a narrow band between sampled tube centres and allows a measured gap", () => {
  const p = fixture(),
    room = p.rooms[0],
    wall = p.walls.find((w) => w.id === room.wallIds[0])!,
    span = roomWallSpan(room, wall)!;
  room.ceilingBands = [
    {
      id: "thin-band",
      name: "Fascia stretta",
      wallId: wall.id,
      offsetM: 1.001,
      lengthM: 0.001,
      depthM: 1,
      elevationM: 2.4,
    },
  ];
  const dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  const path = hose(
    p,
    "narrow",
    [0.5, 3.5].map((offset) =>
      point(
        span.start.x + dx * offset - dy * 0.6,
        span.start.y + dy * offset + dx * 0.6,
        2.4,
      ),
    ),
  );
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    "thin-band",
  );
  path.points = path.points.map((p) => ({ ...p, elevationM: 2.29 }));
  expect(findDuctCollisions(p, [path]).size).toBe(0);
});

it("checks perpendicular clearance from a sloped roof rather than only vertical clearance", () => {
  const p = fixture(),
    room = p.rooms[0];
  room.roof = { ridgeWallId: room.wallIds[0], ridgeHeightM: 8 };
  const wall = p.walls.find((w) => w.id === room.wallIds[0])!,
    span = roomWallSpan(room, wall)!;
  const dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  const path = hose(
    p,
    "sloped",
    [2, 8].map((offset) => {
      const at = {
        x: span.start.x + dx * offset - dy * 2,
        y: span.start.y + dy * offset + dx * 2,
      };
      return { ...at, elevationM: roofHeightAt(p, room, at) - 0.11 };
    }),
  );
  expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
    `roof:${room.id}`,
  );
  path.points = path.points.map((p) => ({
    ...p,
    elevationM: p.elevationM - 0.15,
  }));
  expect(findDuctCollisions(p, [path]).size).toBe(0);
});

it.each([2.4, 2.6])(
  "keeps the technical void continuous between adjacent bands with second underside %s",
  (secondHeight) => {
    const p = fixture(),
      room = p.rooms[0],
      wall = p.walls.find((w) => w.id === room.wallIds[0])!,
      span = roomWallSpan(room, wall)!;
    room.ceilingBands = [
      {
        id: "band-a",
        name: "Fascia A",
        wallId: wall.id,
        offsetM: 1,
        lengthM: 3,
        depthM: 1,
        elevationM: 2.4,
      },
      {
        id: "band-b",
        name: "Fascia B",
        wallId: wall.id,
        offsetM: 4,
        lengthM: 3,
        depthM: 0.6,
        elevationM: secondHeight,
      },
    ];
    const dx = (span.end.x - span.start.x) / span.lengthM,
      dy = (span.end.y - span.start.y) / span.lengthM;
    const line = (depth: number, height: number) =>
      [3.5, 4.5].map((offset) =>
        point(
          span.start.x + dx * offset - dy * depth,
          span.start.y + dy * offset + dx * depth,
          height,
        ),
      );
    const path = hose(p, "joined", line(0.3, 2.9));
    expect(findDuctCollisions(p, [path]).size).toBe(0);
    path.points = line(0.8, 2.9);
    expect(findDuctCollisions(p, [path]).get(path.id)?.withIds).toContain(
      "band-a",
    );
    if (secondHeight > 2.4) {
      path.points = line(0.3, 2.55);
      expect(findDuctCollisions(p, [path]).has(path.id)).toBe(true);
    }
  },
);

it("automatically chooses a clear bend around a band without moving collars or rewriting an operator route", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  const terminal = p.airTerminals[0];
  p.plenums = p.plenums.map((pl) => {
    const gap = (terminal.heightMm + pl.depthMm) / 2000;
    return { ...pl, status: "manual" as const, position: {
      x: terminal.position.x + Math.sin(terminal.rotation) * gap,
      y: terminal.position.y - Math.cos(terminal.rotation) * gap,
    }, elevationM: p.rooms[0].heightM - pl.heightMm / 2000 };
  });
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  const duct = p.ducts!.find((d) => d.terminalId)!,
    original = ductRoute(p, duct);
  const hit = flexibleDuctCurve(original, duct.diameterMm!)!.curve.getPointAt(
    0.5,
  );
  const room = p.rooms[0],
    wall = p.walls.find((w) => w.id === room.wallIds[0])!,
    span = roomWallSpan(room, wall)!;
  const dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  const along = (hit.x - span.start.x) * dx + (hit.z - span.start.y) * dy;
  const band = {
    id: "detour-band",
    name: "Fascia",
    wallId: wall.id,
    offsetM: along - 0.1,
    lengthM: 0.2,
    depthM: -(hit.x - span.start.x) * dy + (hit.z - span.start.y) * dx - 0.05,
    elevationM: hit.y - 0.4,
  };
  const rooms = p.rooms.map((r) => ({ ...r, ceilingBands: [band] }));
  const manual = {
    ...p,
    rooms,
    ducts: p.ducts!.map((d) =>
      d.id === duct.id
        ? { ...d, routing: "manual" as const, waypoints: original.slice(1, -1) }
        : d,
    ),
  };
  const saved = structuredClone(manual.ducts);
  expect(
    findDuctCollisions(
      manual,
      ductScenePaths(manual).filter((path) => path.id === duct.id),
    ).get(duct.id)?.withIds,
  ).toContain(band.id);
  expect(manual.ducts).toEqual(saved);
  const automatic = { ...p, rooms },
    rerouted = ductRoute(automatic, duct);
  expect(rerouted.length).toBeGreaterThan(1);
  expect(flexibleDuctCurve(rerouted, duct.diameterMm!)).not.toBeNull();
  expect(rerouted).not.toEqual(original);
  expect(rerouted[0]).toEqual(original[0]);
  expect(rerouted.at(-1)).toEqual(original.at(-1));
  expect(
    findDuctCollisions(
      automatic,
      ductScenePaths(automatic).filter((path) => path.id === duct.id),
    ).size,
  ).toBe(0);
});

it("uses finite concave ceiling faces and detects crossing in either direction", () => {
  const p = fixture();
  p.rooms[0].polygon = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 5 },
    { x: 0, y: 5 },
  ];
  const surface = ceilingSurfaces(p, p.floors[0].id).find(
    (surface) => surface.deviceId === `roof:${p.rooms[0].id}`,
  )!;
  expect(surface).toBeDefined();
  expect(
    segmentHitsCeilingSurface(
      new Vector3(3, 3.95, 3),
      new Vector3(4, 3.95, 3),
      0.1,
      surface,
    ),
  ).toBe(false);
  const a = new Vector3(1, 3, 1),
    b = new Vector3(1, 5, 1);
  expect(segmentHitsCeilingSurface(a, b, 0.1, surface)).toBe(true);
  expect(segmentHitsCeilingSurface(b, a, 0.1, surface)).toBe(true);
  expect(
    segmentHitsCeilingSurface(
      new Vector3(1, 3.89, 1),
      new Vector3(1.5, 3.89, 1),
      0.1,
      surface,
    ),
  ).toBe(false);
});

it("accepts soft hoses that touch or press against each other, but not one whose axis enters the other", () => {
  const p = fixture(),
    a = hose(p),
    b = hose(p, "side", [point(1, 2.15), point(9, 2.15)]);
  expect(findDuctCollisions(p, [a, b]).size).toBe(0);
  b.points = [point(1, 2.05), point(9, 2.05)];
  expect(findDuctCollisions(p, [a, b]).get(a.id)?.withIds).toContain(b.id);
});
