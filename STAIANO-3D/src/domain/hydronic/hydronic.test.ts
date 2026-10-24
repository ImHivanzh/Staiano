import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import {
  heatPumpCatalog,
  heatPumpCatalogAtVersion,
  heatPumpProductAtVersion,
  heatPumpCapacity,
  heatPumpProductSchema,
} from "@/domain/catalogs/heat-pumps";
import {
  applyHydronicSystem,
  moveHydronicOutdoorUnit,
  removeHydronicSystem,
  placeHeatPumpDraft,
} from "./apply";
import { hydronicOutdoorValid, hydronicOutdoorFootprint } from "./placement";
import { validateHydronicSystem } from "./validation";
import { hydronicPipeRoute } from "./routes";
import { clearProjectSystems } from "../project";
import { movePlacedDevice } from "../geometry/move-device";
import { removeSelection, duplicateSelection } from "../geometry/selection";

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
  it("persists pending pumps, validates their placement and supports move, copy, delete and clear", () => {
    const p = fixture();
    const pending = placeHeatPumpDraft(p, p.floors[0].id, { x: 4, y: -1 });
    const draft = pending.heatPumpDrafts![0];
    expect(
      projectSchema.parse(JSON.parse(JSON.stringify(pending))).heatPumpDrafts,
    ).toEqual([draft]);
    expect(pending.hydronicSystems).toEqual([]);
    expect(() => placeHeatPumpDraft(p, p.floors[0].id, { x: 4, y: 3 })).toThrow(
      "punto esterno",
    );
    expect(() =>
      placeHeatPumpDraft(p, p.floors[0].id, { x: NaN, y: -1 }),
    ).toThrow();
    const moved = movePlacedDevice(pending, draft.id, { x: 5, y: -1 });
    expect(moved.heatPumpDrafts![0].position.x).toBe(5);
    const selection = [{ kind: "device" as const, id: draft.id }];
    expect(duplicateSelection(moved, selection).heatPumpDrafts).toHaveLength(2);
    expect(removeSelection(moved, selection).heatPumpDrafts).toEqual([]);
    expect(clearProjectSystems(moved).heatPumpDrafts).toEqual([]);
  });
  it("has official capacities at explicit conditions and reproducible sources", () => {
    expect(heatPumpCatalog.products).toHaveLength(61);
    const daikin = heatPumpProductAtVersion(
      "daikin-altherma-3m-ebla09dv3",
      heatPumpCatalog.version,
    )!;
    expect(daikin.operatingPoints[0]).toMatchObject({
      heatingW: 10420,
      coolingW: 16310,
      heatingWaterSupplyC: 35,
      coolingWaterSupplyC: 18,
    });
    expect([daikin.widthMm, daikin.heightMm, daikin.depthMm]).toEqual([
      1380, 870, 460,
    ]);
    expect(daikin.sourceMetadata.page).toBe(193);
    const erla = heatPumpProductAtVersion(
      "daikin-altherma-3-r-erla16dw17",
      heatPumpCatalog.version,
    )!;
    expect(erla.operatingPoints[1]).toMatchObject({
      heatingW: 10840,
      coolingW: 13530,
      cop: 2.67,
      eer: 2.84,
      heatingWaterSupplyC: 35,
      coolingWaterSupplyC: 7,
    });
    expect([erla.widthMm, erla.heightMm, erla.depthMm]).toEqual([
      870, 1100, 460,
    ]);
    expect(erla.sourceMetadata.page).toBe(160);
    const erra = heatPumpProductAtVersion(
      "daikin-altherma-3-r-mt-erra08ew1",
      heatPumpCatalog.version,
    )!;
    expect(erra.operatingPoints[0]).toMatchObject({
      heatingW: 7950,
      coolingW: 10890,
      cop: 4.89,
      eer: 4.52,
    });
    expect(erra.sourceMetadata.page).toBe(166);
    const epra = heatPumpProductAtVersion(
      "daikin-altherma-3-h-ht-epra18dv37",
      heatPumpCatalog.version,
    )!;
    expect(epra.operatingPoints[1]).toMatchObject({
      heatingW: 12470,
      coolingW: 8860,
      cop: 2.22,
      eer: 2.69,
    });
    expect([epra.widthMm, epra.heightMm, epra.depthMm]).toEqual([
      1003, 1270, 533,
    ]);
    expect(epra.sourceMetadata.page).toBe(174);
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
  it.each([
    [35, 6350, 6040, 4520, 3810],
    [50, 7570, 7190, 5200, 5400],
    [80, 11740, 11500, 8450, 8500],
    [120, 14370, 13650, 11470, 10300],
    [150, 17650, 16770, 13790, 11880],
  ])(
    "imports the documented Min/Nom/Max column for Chaffoteaux %s",
    (size, heat35, heat45, heatMinus7, cold) => {
      const products = heatPumpCatalog.products.filter(
        (product) =>
          product.manufacturer === "Chaffoteaux" &&
          new RegExp(`\\b${size}\\b`).test(product.model),
      );
      expect(products.length).toBeGreaterThan(0);
      for (const product of products) {
        expect(
          product.operatingPoints.map((point) => [
            point.maxHeatingW,
            point.maxCoolingW,
          ]),
        ).toEqual([
          [heat35, cold],
          [heat45, cold],
          [heatMinus7, cold],
        ]);
        expect(
          heatPumpProductSchema.safeParse({
            ...product,
            operatingPoints: [
              { ...product.operatingPoints[0], maxHeatingW: 1 },
            ],
          }).success,
        ).toBe(false);
      }
    },
  );
  it("keeps historical declared capacities when maximum outputs are unavailable", () => {
    const previous = heatPumpCatalogAtVersion("heat-pumps-dd01394cdc900d50")!
      .products[0];
    const point = previous.operatingPoints[0];
    expect(heatPumpCapacity(point)).toEqual({
      heatingW: point.heatingW,
      coolingW: point.coolingW,
      basis: "dichiarate (massimi non disponibili)",
    });
  });
  it.each([
    ["35-m", 3302018, 756, 3500, 3000, 3510, 3500, 5.1, 3.74, 3.1, 3.4],
    ["50-m", 3302019, 756, 5000, 4050, 5000, 5000, 5, 3.65, 2.9, 2.85],
    ["80-m", 3302020, 1106, 8000, 6000, 7410, 7000, 4.8, 3.7, 3, 3.1],
    ["80-m-t", 3302021, 1106, 8000, 6000, 7410, 7000, 4.8, 3.7, 3, 3.1],
    ["120-m", 3302022, 1506, 12000, 8200, 9510, 9050, 4.9, 4.1, 3.2, 3.15],
    ["120-m-t", 3302023, 1506, 12000, 8200, 9510, 9050, 4.9, 4.1, 3.2, 3.15],
    ["150-m", 3302024, 1506, 15000, 9900, 11000, 11000, 4.7, 4, 3.1, 2.93],
    ["150-m-t", 3302025, 1506, 15000, 9900, 11000, 11000, 4.7, 4, 3.1, 2.93],
  ])(
    "places LITE %s with documented nominal performance and dimensions",
    (
      variant,
      code,
      height,
      heat35,
      heat45,
      heatMinus7,
      cold,
      cop35,
      cop45,
      copMinus7,
      eer,
    ) => {
      const product = heatPumpProductAtVersion(
        `chaffoteaux-arianext-lite-${variant}-r32`,
        heatPumpCatalog.version,
      )!;
      expect(product.family).toBe("ARIANEXT LITE M LINK R32");
      expect(product.features).toContain(`Codice sistema ${code}`);
      expect([product.widthMm, product.heightMm, product.depthMm]).toEqual([
        1016,
        height,
        383,
      ]);
      expect(
        product.operatingPoints.map((point) => [
          point.heatingW,
          point.coolingW,
          point.cop,
          point.eer,
          point.heatingWaterSupplyC,
          point.heatingOutdoorC,
          point.coolingWaterSupplyC,
          point.coolingOutdoorC,
        ]),
      ).toEqual([
        [heat35, cold, cop35, eer, 35, 7, 7, 35],
        [heat45, cold, cop45, eer, 45, 7, 7, 35],
        [heatMinus7, cold, copMinus7, eer, 35, -7, 7, 35],
      ]);
      const p = fixture();
      const next = applyHydronicSystem(p, {
        productId: product.id,
        roomIds: [p.rooms[0].id],
        fanCoilIds: [],
        operatingPointIndex: 1,
      });
      const system = next.hydronicSystems![0];
      expect(system.outdoorUnit).toMatchObject({
        widthMm: 1016,
        heightMm: height,
        depthMm: 383,
      });
      expect(hydronicOutdoorValid(next, system.outdoorUnit)).toBe(true);
      expect(
        projectSchema.parse(JSON.parse(JSON.stringify(next))).hydronicSystems,
      ).toEqual(next.hydronicSystems);
    },
  );
  it("keeps all eight LITE variants, their offline photo and original catalog revisions", () => {
    const lite = heatPumpCatalog.products.filter(
      (product) => product.family === "ARIANEXT LITE M LINK R32",
    );
    expect(lite).toHaveLength(8);
    expect(
      lite.filter((product) => product.model.includes("M-T")),
    ).toHaveLength(3);
    const product = lite[0];
    expect(product.sourceMetadata).toMatchObject({
      page: 4,
      sourceType: "pdf",
      sha256:
        "c83e85bb612e57d95c60f3f07c7a82b50cf3fc7a523a154b5e1a55bcb9be24ca",
    });
    const photo = readFileSync(
      join(process.cwd(), "public", product.productPhoto.localPath),
    );
    expect(createHash("sha256").update(photo).digest("hex")).toBe(
      product.productPhoto.sha256,
    );
    const original = heatPumpCatalogAtVersion("heat-pumps-dd01394cdc900d50")!;
    expect(original.products).toHaveLength(5);
    for (const previous of original.products) {
      expect(
        heatPumpProductAtVersion(previous.id, heatPumpCatalog.version),
      ).toMatchObject(previous);
    }
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
