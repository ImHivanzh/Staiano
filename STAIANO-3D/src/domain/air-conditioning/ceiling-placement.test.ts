import {
  deviceEnvelope,
  projectDeviceEnvelopes,
} from "../geometry/device-envelope";
import { validateProject } from "../validation";
import { bodies } from "../ducted/duct-bodies";
import type { Project } from "@/schemas/project";
import { splitCenterElevationM } from "./elevation";
import { ceilingHeightAt, roofHeightAt } from "../geometry/ceilings";
import { roomWallSpan, positionAlongRoomWall } from "../geometry/placement";
import { footprintCorners } from "../geometry/footprint";
import { movePlacedDevice } from "../geometry/move-device";
import { expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { splitCatalog } from "@/domain/catalogs/splits";
import { vrvCatalog } from "@/domain/catalogs/vrv";
import { applySplitSystem } from "./apply";
import { sizeSplitSystems, usableSplitWall } from "./size";
import { validateSplitSystem } from "./validate";
import { refreshSplitBindings } from "./refresh";
import { applyVrvSystem } from "./vrv-apply";
import { sizeVrvSystems, usableVrvWall } from "./vrv-size";
import { validateVrvSystem } from "./vrv-validate";
import { refreshVrvBindings } from "./vrv-refresh";

it.each(["split", "vrv"] as const)(
  "%s checks the finished ceiling without replacing a saved unit",
  (type) => {
    const empty = createProject();
    const room = addRectangle(empty, empty.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    const ids = [room.rooms[0].id];
    const installed =
      type === "split"
        ? applySplitSystem(room, ids, "Daikin", null)
        : applyVrvSystem(room, ids, null);
    const system = installed.hvacSystems[0];
    const height = system.indoorUnits[0].heightMm / 1000;
    const lowered = {
      ...installed,
      rooms: installed.rooms.map((r) => ({
        ...r,
        ceilingHeightM: height + 0.099,
      })),
    };
    const solutions =
      type === "split"
        ? sizeSplitSystems(lowered, ids, "Daikin", splitCatalog)
        : sizeVrvSystems(lowered, ids, vrvCatalog);
    expect(
      solutions.some((solution) =>
        "combination" in solution
          ? solution.combination.id === system.productId
          : solution.outdoor.id === system.productId &&
            solution.assignments[0].indoor.id ===
              system.indoorUnits[0].productId,
      ),
    ).toBe(false);
    const checks =
      type === "split"
        ? validateSplitSystem(lowered, system)
        : validateVrvSystem(lowered, system);
    expect(checks).toContainEqual(
      expect.objectContaining({
        code: `${type}-placement`,
        status: "invalid",
        entityId: system.indoorUnits[0].id,
      }),
    );
    const refreshed =
      type === "split"
        ? refreshSplitBindings(lowered)
        : refreshVrvBindings(lowered);
    expect(refreshed.hvacSystems[0].indoorUnits).toEqual(system.indoorUnits);
    const fits = {
      ...installed,
      rooms: installed.rooms.map((r) => ({
        ...r,
        ceilingHeightM: height + 0.1,
      })),
    };
    const valid =
      type === "split"
        ? validateSplitSystem(fits, system)
        : validateVrvSystem(fits, system);
    expect(valid).toContainEqual(
      expect.objectContaining({ code: `${type}-placement`, status: "valid" }),
    );
  },
);

function installedRoom(type: "split" | "vrv") {
  const p = createProject();
  const room = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera",
  });
  return type === "split"
    ? applySplitSystem(room, [room.rooms[0].id], "Daikin", null)
    : applyVrvSystem(room, [room.rooms[0].id], null);
}
function narrowBand(p: Project, elevationM: number): Project {
  const room = p.rooms[0],
    unit = p.hvacSystems[0].indoorUnits[0];
  const wall = p.walls.find((w) => w.id === unit.wallId)!;
  const span = roomWallSpan(room, wall)!;
  const along =
    ((unit.position.x - span.start.x) * (span.end.x - span.start.x) +
      (unit.position.y - span.start.y) * (span.end.y - span.start.y)) /
    span.lengthM;
  const band = {
    id: "edge-band",
    name: "Fascia",
    wallId: wall.id,
    offsetM: along + unit.widthMm / 4000,
    lengthM: unit.widthMm / 8000,
    depthM: 0.8,
    elevationM,
  };
  return {
    ...p,
    rooms: p.rooms.map((r) =>
      r.id === room.id ? { ...r, ceilingBands: [band] } : r,
    ),
  };
}
it.each(["split", "vrv"] as const)(
  "%s uses a low band crossing the footprint even when no corner or centre lies inside it",
  (type) => {
    const p = narrowBand(installedRoom(type), 2.1),
      room = p.rooms[0],
      unit = p.hvacSystems[0].indoorUnits[0];
    const corners = footprintCorners(
      unit.position,
      unit.widthMm / 1000,
      unit.depthMm / 1000,
      unit.rotation,
    );
    expect(ceilingHeightAt(p, room, unit.position)).toBe(2.7);
    expect(
      corners.every((point) => ceilingHeightAt(p, room, point) === 2.7),
    ).toBe(true);
    expect(
      splitCenterElevationM(room, unit, p) + unit.heightMm / 2000,
    ).toBeCloseTo(2.0, 7);
  },
);
it.each(["split", "vrv"] as const)(
  "%s follows the lowest roof point above its whole gable-wall footprint",
  (type) => {
    const p = installedRoom(type),
      room = p.rooms[0];
    room.roof = { ridgeWallId: room.wallIds[0], ridgeHeightM: 4.2 };
    const wall = p.walls.find((w) => w.id === room.wallIds[1])!,
      span = roomWallSpan(room, wall)!;
    const unit = {
      ...p.hvacSystems[0].indoorUnits[0],
      wallId: wall.id,
      position: positionAlongRoomWall(
        room,
        wall,
        span.lengthM / 2,
        p.hvacSystems[0].indoorUnits[0].depthMm / 1000,
      ),
      rotation: Math.atan2(
        span.end.y - span.start.y,
        span.end.x - span.start.x,
      ),
    };
    const roof = Math.min(
      ...footprintCorners(
        unit.position,
        unit.widthMm / 1000,
        unit.depthMm / 1000,
        unit.rotation,
      ).map((point) => roofHeightAt(p, room, point)),
    );
    expect(roof).toBeGreaterThan(room.heightM + 0.5);
    expect(
      splitCenterElevationM(room, unit, p) + unit.heightMm / 2000,
    ).toBeCloseTo(roof - 0.1, 7);
  },
);
it.each(["split", "vrv"] as const)(
  "%s flags an impossible saved band pose, preserves it on refresh and repositions only on explicit reconfiguration",
  (type) => {
    const placed = installedRoom(type),
      system = placed.hvacSystems[0],
      unit = system.indoorUnits[0];
    const p = narrowBand(placed, unit.heightMm / 1000 + 0.099);
    const checks =
      type === "split"
        ? validateSplitSystem(p, system)
        : validateVrvSystem(p, system);
    expect(checks).toContainEqual(
      expect.objectContaining({
        code: `${type}-placement`,
        status: "invalid",
        entityId: unit.id,
      }),
    );
    const refreshed =
      type === "split" ? refreshSplitBindings(p) : refreshVrvBindings(p);
    expect(refreshed.hvacSystems[0].indoorUnits).toEqual(system.indoorUnits);
    const wall = (type === "split" ? usableSplitWall : usableVrvWall)(
      p,
      p.rooms[0],
      unit,
    );
    expect(wall?.wall.id).not.toBe(unit.wallId);
    expect(() => movePlacedDevice(p, unit.id, unit.position)).toThrow(
      /soffitto/,
    );
    const saved =
      type === "split"
        ? applySplitSystem(
            p,
            [p.rooms[0].id],
            "Daikin",
            system.id,
            system.productId,
          )
        : applyVrvSystem(p, [p.rooms[0].id], system.id, system.productId);
    expect(saved.hvacSystems[0].indoorUnits[0].id).toBe(unit.id);
    expect(saved.hvacSystems[0].indoorUnits[0].wallId).not.toBe(unit.wallId);
  },
);

it("includes VRV bodies in shared overlap checks and only once in flexible-duct obstacles", () => {
  const p = narrowBand(installedRoom("vrv"), 2.1),
    unit = p.hvacSystems[0].indoorUnits[0];
  const envelope = deviceEnvelope(p, unit.id);
  expect(envelope).not.toBeNull();
  expect(envelope!.maxZ).toBeCloseTo(2, 7);
  expect(
    projectDeviceEnvelopes(p).filter((body) => body.deviceId === unit.id),
  ).toHaveLength(1);
  expect(
    bodies(p, new Set([unit.floorId]), new Map()).filter(
      (body) => body.deviceId === unit.id,
    ),
  ).toHaveLength(1);
  const other = { ...unit, id: "overlapping-vrv" };
  p.hvacSystems[0].indoorUnits.push(other);
  const checks = validateProject(p);
  for (const id of [unit.id, other.id])
    expect(checks).toContainEqual(
      expect.objectContaining({
        code: "deviceCollision",
        status: "invalid",
        entityId: id,
      }),
    );
});
