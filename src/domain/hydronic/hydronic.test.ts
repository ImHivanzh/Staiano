import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import {
  heatPumpCatalog,
  heatPumpProductAtVersion,
} from "@/domain/catalogs/heat-pumps";
import {
  applyHydronicSystem,
  moveHydronicOutdoorUnit,
  removeHydronicSystem,
} from "./apply";
import { hydronicOutdoorValid, hydronicOutdoorFootprint } from "./placement";
import { validateHydronicSystem } from "./validation";
import { hydronicPipeRoute } from "./routes";

function fixture() {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
}
function pump(p = fixture()) {
  return applyHydronicSystem(p, {
    productId: "gree-versati-v-8-monofase",
    roomIds: [p.rooms[0].id],
    fanCoilIds: p.fanCoils?.map((u) => u.id) ?? [],
    operatingPointIndex: 1,
  });
}

describe("impianto idronico documentato", () => {
  it("has official capacities at explicit conditions and reproducible sources", () => {
    expect(heatPumpCatalog.products).toHaveLength(5);
    const gree = heatPumpProductAtVersion(
      "gree-versati-v-8-monofase",
      heatPumpCatalog.version,
    )!;
    expect(gree.operatingPoints[1]).toMatchObject({
      heatingW: 8200,
      coolingW: 7500,
      heatingWaterSupplyC: 45,
      coolingWaterSupplyC: 7,
    });
    expect([gree.widthMm, gree.heightMm, gree.depthMm]).toEqual([
      1206, 880, 445,
    ]);
    expect(heatPumpProductAtVersion(gree.id, "missing-version")).toBeNull();
  });
  it("places multiple outdoor units beyond complete wall bounds, preserves save/reload and originals", () => {
    const first = pump(),
      u = first.hydronicSystems![0].outdoorUnit;
    expect(hydronicOutdoorValid(first, u)).toBe(true);
    expect(
      Math.max(...hydronicOutdoorFootprint(u).map((p) => p.y)),
    ).toBeLessThan(
      Math.min(
        ...first.walls.map(
          (w) => Math.min(w.start.y, w.end.y) - w.thickness / 2,
        ),
      ),
    );
    const second = pump(first);
    expect(second.hydronicSystems).toHaveLength(2);
    expect(second.hydronicSystems![0]).toEqual(first.hydronicSystems![0]);
    expect(second.hydronicSystems![1].outdoorUnit.position).not.toEqual(
      u.position,
    );
    expect(
      projectSchema.parse(JSON.parse(JSON.stringify(second))).hydronicSystems,
    ).toEqual(second.hydronicSystems);
  });
  it("rejects indoor positions, wall crossings, rotated overlap, below-floor and another outdoor unit", () => {
    const p = pump(),
      u = p.hydronicSystems![0].outdoorUnit,
      room = p.rooms[0];
    expect(() =>
      moveHydronicOutdoorUnit(p, u.id, { position: room.centroid }),
    ).toThrow("all’esterno");
    const wall = p.walls[0];
    expect(() =>
      moveHydronicOutdoorUnit(p, u.id, {
        position: {
          x: (wall.start.x + wall.end.x) / 2,
          y: (wall.start.y + wall.end.y) / 2,
        },
      }),
    ).toThrow();
    expect(
      hydronicOutdoorValid(p, {
        ...u,
        position: { x: room.centroid.x, y: room.polygon[0].y - 0.2 },
        rotation: Math.PI / 4,
      }),
    ).toBe(false);
    expect(
      hydronicOutdoorValid(p, { ...u, elevationM: u.heightMm / 2000 - 0.01 }),
    ).toBe(false);
    const second = pump(p);
    expect(() =>
      moveHydronicOutdoorUnit(
        second,
        second.hydronicSystems![1].outdoorUnit.id,
        { position: u.position },
      ),
    ).toThrow();
    expect(() => moveHydronicOutdoorUnit(p, u.id, { rotation: NaN })).toThrow();
  });
  it("links selected coils, refuses duplicate association and excludes unmatched water conditions", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-400-2t", 0);
    p = pump(p);
    const system = p.hydronicSystems![0];
    const matched = validateHydronicSystem(p, system);
    expect(matched.fanCoilHeatingW).toBe(2210);
    expect(matched.fanCoilCoolingW).toBe(2120);
    const unmatched = validateHydronicSystem(p, {
      ...system,
      operatingPointIndex: 0,
    });
    expect(unmatched.fanCoilHeatingW).toBe(0);
    expect(
      unmatched.warnings.some((w) => w.includes("diverse o non documentate")),
    ).toBe(true);
    expect(() => pump(p)).toThrow("un solo impianto");
    expect(() =>
      applyHydronicSystem(p, {
        productId: system.productId,
        roomIds: system.roomIds,
        fanCoilIds: ["missing"],
        operatingPointIndex: 1,
      }),
    ).toThrow();
  });
  it("keeps manual waypoints while live endpoints follow the pump and coil", () => {
    let p = fixture();
    p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-400-2t", 0);
    p = pump(p);
    const s = p.hydronicSystems![0],
      id = s.fanCoilIds[0];
    s.pipeWaypoints = [
      {
        fanCoilId: id,
        points: [
          { x: -2, y: -3 },
          { x: 1, y: 2 },
        ],
      },
    ];
    const old = hydronicPipeRoute(p, s, id);
    const moved = moveHydronicOutdoorUnit(p, s.outdoorUnit.id, {
        position: {
          x: s.outdoorUnit.position.x,
          y: s.outdoorUnit.position.y - 1,
        },
      }),
      next = moved.hydronicSystems![0];
    expect(next.pipeWaypoints).toEqual(s.pipeWaypoints);
    expect(hydronicPipeRoute(moved, next, id)[0].y).toBe(old[0].y - 1);
    moved.fanCoils![0].position.x += 0.1;
    expect(hydronicPipeRoute(moved, next, id).at(-1)?.x).toBe(
      moved.fanCoils![0].position.x,
    );
    expect(removeHydronicSystem(moved, s.id).fanCoils).toEqual(moved.fanCoils);
  });
});
