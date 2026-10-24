import { expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  recomputeProject,
} from "../project";
import { applyFanCoil } from "./apply";
import {
  fanCoilEnvelope,
  fanCoilPlacementValid,
} from "./placement";
import {
  distance,
  projection,
  scale,
  subtract,
} from "../geometry/primitives";
import {
  positionAlongRoomWall,
  roomWallSpan,
} from "../geometry/placement";
import { validateProject } from "../validation";

function fixture(thickness = 0.3) {
  const p = createProject();
  p.projectSettings.externalWallThicknessM = thickness;
  return addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Sala",
  });
}

it("recesses a wall-mounted SLI inside the wall with a flush front", () => {
  let p = fixture();
  p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sli-200-2t", 0, {
    mounting: "wall",
  });
  const unit = p.fanCoils![0];
  const room = p.rooms[0];
  const wall = p.walls.find((w) => w.id === unit.wallId)!;
  const span = roomWallSpan(room, wall)!;
  const v = scale(subtract(span.end, span.start), 1 / span.lengthM);
  const normal = { x: -v.y, y: v.x };
  const frontCenter = {
    x: unit.position.x + (normal.x * unit.depthMm) / 2000,
    y: unit.position.y + (normal.y * unit.depthMm) / 2000,
  };
  // La faccia anteriore sta 2 mm nella stanza, non 126 mm.
  expect(
    distance(frontCenter, projection(frontCenter, span.start, span.end)),
  ).toBeCloseTo(0.002, 6);
  expect(unit.position).not.toEqual(
    positionAlongRoomWall(room, wall, distance(span.start, projection(unit.position, span.start, span.end)), unit.depthMm / 1000),
  );
  expect(fanCoilPlacementValid(p, unit)).toBe(true);
  expect(fanCoilEnvelope(unit).minZ).toBeGreaterThanOrEqual(0);
  const invalid = validateProject(p).filter(
    (check) =>
      check.entityId === unit.id &&
      check.status === "invalid" &&
      (check.code === "placement" || check.code === "deviceEnvelope"),
  );
  expect(invalid).toEqual([]);
});

it("rejects a wall recess when the wall is thinner than the body", () => {
  const p = fixture(0.1);
  expect(() =>
    applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sli-200-2t", 0, {
      mounting: "wall",
    }),
  ).toThrow(/posizione/i);
});

it("moves a saved protruding SLI back inside the wall when recomputing", () => {
  let p = fixture();
  p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sli-200-2t", 0, {
    mounting: "wall",
  });
  const unit = p.fanCoils![0];
  const room = p.rooms[0];
  const wall = p.walls.find((w) => w.id === unit.wallId)!;
  const span = roomWallSpan(room, wall)!;
  const along = distance(
    span.start,
    projection(unit.position, span.start, span.end),
  );
  const old = {
    ...unit,
    position: positionAlongRoomWall(
      room,
      wall,
      along,
      unit.depthMm / 1000,
    ),
  };
  const loaded = recomputeProject({ ...p, fanCoils: [old] });
  expect(loaded.fanCoils![0].position).not.toEqual(old.position);
  expect(fanCoilPlacementValid(loaded, loaded.fanCoils![0])).toBe(true);
});
