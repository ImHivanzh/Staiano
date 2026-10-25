import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import { setWallDrywall, drywallGeometry } from "./drywall";
import { roomWallSpan } from "./placement";
import { area, distance } from "./primitives";
import { duplicateSelection } from "./selection";
import { recomputeProject } from "../project";
import { projectSchema } from "@/schemas/project";
import { parseProject } from "@/services/project/format";
import { addRectangle, addWall, createProject } from "../project";
import { drywallSideForRoom, drywallSides } from "./drywall-sides";

it.each([0.3, -0.3])(
  "preserves the reference wall and creates the signed hollow depth %s",
  (offsetM) => {
    const base = guidedProjectFixture(),
      room = base.rooms[0],
      wall = base.walls.find((w) => w.id === room.wallIds[0])!;
    const before = roomWallSpan(room, wall)!;
    const p = setWallDrywall(base, wall.id, { roomId: room.id, offsetM });
    const saved = p.walls.find((w) => w.id === wall.id)!,
      geometry = drywallGeometry(p, saved)!;
    expect(saved.start).toEqual(wall.start);
    expect(saved.end).toEqual(wall.end);
    expect(geometry.depthM).toBeCloseTo(0.3);
    expect(distance(geometry.front.start, geometry.back.start)).toBeCloseTo(
      0.3,
    );
    expect(area(geometry.polygon)).toBeCloseTo(before.lengthM * 0.3);
    const face = roomWallSpan(p.rooms[0], saved)!;
    expect(distance(face.start, before.start)).toBeCloseTo(
      offsetM > 0 ? 0.3 : 0,
    );
    expect(p.rooms[0].netAreaM2).toBeCloseTo(
      room.netAreaM2 - (offsetM > 0 ? before.lengthM * 0.3 : 0),
    );
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(recomputeProject(p).rooms[0].netAreaM2).toBeCloseTo(
      p.rooms[0].netAreaM2,
    );
  },
);

it("keeps independent linings on both sides of a shared partition", () => {
  let project = createProject("Controparete su due lati", 35);
  project.projectSettings.externalWallThicknessM = 0.3;
  project = addRectangle(project, project.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Stanza A",
  });
  project = addWall(
    project,
    project.floors[0].id,
    { x: 2, y: 0 },
    { x: 2, y: 4.1 },
  );
  expect(project.rooms).toHaveLength(2);
  const [a, b] = project.rooms,
    wall = project.walls.find(
      (candidate) =>
        a.wallIds.includes(candidate.id) && b.wallIds.includes(candidate.id),
    )!;
  const before = new Map(
    project.rooms.map((room) => [room.id, room.netAreaM2]),
  );
  project = setWallDrywall(project, wall.id, { roomId: a.id, offsetM: 0.3 });
  project = setWallDrywall(project, wall.id, { roomId: b.id, offsetM: 0.45 });
  const configured = project.walls.find(
    (candidate) => candidate.id === wall.id,
  )!;
  const sideA = drywallGeometry(project, configured, a.id)!,
    sideB = drywallGeometry(project, configured, b.id)!;
  expect(drywallSides(configured)).toHaveLength(2);
  expect(drywallSideForRoom(configured, a.id)?.offsetM).toBe(0.3);
  expect(drywallSideForRoom(configured, b.id)?.offsetM).toBe(0.45);
  expect(sideA.normal.x).toBeCloseTo(-sideB.normal.x);
  expect(sideA.normal.y).toBeCloseTo(-sideB.normal.y);
  for (const room of [a, b]) {
    const side = room.id === a.id ? sideA : sideB;
    expect(
      project.rooms.find((item) => item.id === room.id)!.netAreaM2,
    ).toBeCloseTo(before.get(room.id)! - side.reference.lengthM * side.depthM);
  }
  expect(projectSchema.safeParse(project).success).toBe(true);

  const restored = setWallDrywall(project, wall.id, undefined, b.id),
    restoredWall = restored.walls.find(
      (candidate) => candidate.id === wall.id,
    )!;
  expect(drywallSideForRoom(restoredWall, a.id)?.offsetM).toBe(0.3);
  expect(drywallSideForRoom(restoredWall, b.id)).toBeUndefined();

  const copy = duplicateSelection(
    project,
    [
      { kind: "room", id: a.id },
      { kind: "room", id: b.id },
    ],
    { x: 12, y: 0 },
  );
  const copiedRooms = copy.rooms.filter(
      (room) => !project.rooms.some((source) => source.id === room.id),
    ),
    copiedWall = copy.walls.find(
      (candidate) =>
        !project.walls.some((source) => source.id === candidate.id) &&
        candidate.drywall?.otherSide,
    )!;
  expect(copiedRooms).toHaveLength(2);
  expect(
    [copiedWall.drywall!.roomId, copiedWall.drywall!.otherSide!.roomId].every(
      (roomId) => copiedRooms.some((room) => room.id === roomId),
    ),
  ).toBe(true);
  expect(projectSchema.safeParse(copy).success).toBe(true);
});

it("migrates a saved single-sided schema 9 lining without changing its room or offset", () => {
  const project = guidedProjectFixture(),
    wall = project.walls[0],
    room = project.rooms[0];
  const old = setWallDrywall(project, wall.id, {
    roomId: room.id,
    offsetM: -0.25,
  });
  const restored = parseProject({ ...old, schemaVersion: 9 });
  const side = drywallSideForRoom(
    restored.walls.find((item) => item.id === wall.id)!,
    room.id,
  );
  expect(restored.schemaVersion).toBe(11);
  expect(side).toEqual({ roomId: room.id, offsetM: -0.25 });
});

it.each([0.3, -0.3])(
  "joins side-wall cavities at an open mitred corner (%s)",
  (offsetM) => {
    let p = guidedProjectFixture();
    const room = p.rooms[0];
    p = setWallDrywall(p, room.wallIds[0], { roomId: room.id, offsetM });
    p = setWallDrywall(p, room.wallIds[1], { roomId: room.id, offsetM });
    const a = drywallGeometry(
        p,
        p.walls.find((w) => w.id === room.wallIds[0])!,
      )!,
      b = drywallGeometry(
        p,
        p.walls.find((w) => w.id === room.wallIds[1])!,
      )!;
    expect(a.joinedStart || a.joinedEnd).toBe(true);
    expect(b.joinedStart || b.joinedEnd).toBe(true);
    expect(
      [b.front.start, b.front.end].some(
        (point) =>
          distance(point, a.front.end) < 1e-7 ||
          distance(point, a.front.start) < 1e-7,
      ),
    ).toBe(true);
    expect(
      [b.back.start, b.back.end].some(
        (point) =>
          distance(point, a.back.end) < 1e-7 ||
          distance(point, a.back.start) < 1e-7,
      ),
    ).toBe(true);
    const copy = duplicateSelection(p, [{ kind: "room", id: room.id }], {
      x: 12,
      y: 0,
    });
    expect(projectSchema.safeParse(copy).success).toBe(true);
    expect(copy.walls.filter((w) => w.drywall)).toHaveLength(4);
  },
);

it("preserves terminal offset on a new front and restores it when removing the lining", () => {
  let p = addGuidedTerminal(guidedProjectFixture(), 1000, "EDLH", "wall");
  const t = p.airTerminals[0],
    old = { ...t.position };
  const next = setWallDrywall(p, t.wallId!, { roomId: t.roomId, offsetM: 0.3 });
  expect(distance(old, next.airTerminals[0].position)).toBeCloseTo(0.3);
  p = setWallDrywall(next, t.wallId!, undefined);
  expect(distance(old, p.airTerminals[0].position)).toBeCloseTo(0);
});

it("rejects an unrelated room or locked wall", () => {
  const p = guidedProjectFixture(),
    wall = p.walls[0];
  expect(() =>
    setWallDrywall(p, wall.id, { roomId: "missing", offsetM: 0.3 }),
  ).toThrow(/adiacente/);
  wall.locked = true;
  expect(() =>
    setWallDrywall(p, wall.id, { roomId: p.rooms[0].id, offsetM: 0.3 }),
  ).toThrow(/sbloccata/);
});

it("keeps a grille clear of the adjoining lining when a side wall is added", () => {
  let p = addGuidedTerminal(guidedProjectFixture(), 1000, "EDLH", "wall");
  const t = p.airTerminals[0],
    room = p.rooms[0],
    wall = p.walls.find((w) => w.id === t.wallId)!;
  const span = roomWallSpan(room, wall)!,
    dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  t.position = {
    x: span.start.x + dx * 0.53 - dy * 0.08,
    y: span.start.y + dy * 0.53 + dx * 0.08,
  };
  const adjacent = p.walls.find(
    (w) =>
      w.id !== wall.id &&
      room.wallIds.includes(w.id) &&
      [roomWallSpan(room, w)?.start, roomWallSpan(room, w)?.end].some(
        (point) => point && distance(point, span.start) < 1e-5,
      ),
  )!;
  p = setWallDrywall(p, wall.id, { roomId: room.id, offsetM: 0.3 });
  p = setWallDrywall(p, adjacent.id, { roomId: room.id, offsetM: 0.3 });
  const front = drywallGeometry(
    p,
    p.walls.find((w) => w.id === wall.id)!,
  )!.front;
  const along =
    (p.airTerminals[0].position.x - front.start.x) * dx +
    (p.airTerminals[0].position.y - front.start.y) * dy;
  expect(along).toBeGreaterThanOrEqual(t.widthMm / 2000 + 0.02 - 1e-7);
});

it("counts a pillar overlapping a lining only once in usable area", () => {
  let p = guidedProjectFixture();
  const room = p.rooms[0],
    wall = p.walls.find((w) => w.id === room.wallIds[0])!,
    span = roomWallSpan(room, wall)!;
  const dx = (span.end.x - span.start.x) / span.lengthM,
    dy = (span.end.y - span.start.y) / span.lengthM;
  p.pillars = [
    {
      id: crypto.randomUUID(),
      floorId: room.floorId,
      position: {
        x: (span.start.x + span.end.x) / 2 - dy * 0.3,
        y: (span.start.y + span.end.y) / 2 + dx * 0.3,
      },
      rotation: Math.atan2(dy, dx),
      widthMm: 400,
      depthMm: 400,
      heightMm: 2700,
      locked: false,
    },
  ];
  p = setWallDrywall(p, wall.id, { roomId: room.id, offsetM: 0.3 });
  expect(p.rooms[0].netAreaM2).toBeCloseTo(
    room.netAreaM2 - span.lengthM * 0.3 - 0.16 + 0.08,
  );
});
