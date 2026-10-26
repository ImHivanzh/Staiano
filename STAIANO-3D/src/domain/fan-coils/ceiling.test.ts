import { expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  updateRoom,
  recomputeProject,
} from "../project";
import { applyFanCoil, updateFanCoil } from "./apply";
import {
  fanCoilEnvelope,
  fanCoilPlacementValid,
  fanCoilCeilingRange,
} from "./placement";
import { fanCoilCatalog, fanCoilProductAtVersion } from "../catalogs/fan-coils";
import { validateProject } from "../validation";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";
import { buildDossier } from "@/services/pdf/dossier";
import { footprintCorners } from "../geometry/footprint";
import { roofHeightAt } from "../geometry/ceilings";
import {
  encodeProject,
  decodeProject,
  parseProject,
} from "@/services/project/format";
import { movePlacedDevice } from "../geometry/move-device";

function fixture() {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Sala",
  });
}

it("hangs exposed ceiling units below the whole structural ceiling", () => {
  const p = fixture();
  const placed = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
    mounting: "ceiling",
  });
  const body = fanCoilEnvelope(placed.fanCoils![0]);
  expect(body.maxZ).toBeCloseTo(2.7);
  expect(body.minZ).toBeCloseTo(2.571);
});

it("distinguishes exposed and concealed units at a suspended ceiling", () => {
  const empty = fixture();
  const p = updateRoom(empty, empty.rooms[0].id, {
    heightM: 3.1,
    ceilingHeightM: 2.8,
  });
  for (const [id, min, max] of [
    ["innova-airleaf-sl-200-2t", 2.671, 2.8],
    ["innova-airleaf-sli-200-2t", 2.8, 2.926],
  ] as const) {
    const placed = applyFanCoil(p, p.rooms[0].id, id, {
      mounting: "ceiling",
    });
    const body = fanCoilEnvelope(placed.fanCoils![0]);
    expect(body.minZ, id).toBeCloseTo(min);
    expect(body.maxZ, id).toBeCloseTo(max);
  }
});

it("does not hang a recessed unit below the ceiling without a technical void", () => {
  const p = fixture();
  expect(() =>
    applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sli-200-2t", {
      mounting: "ceiling",
    }),
  ).toThrow(/posizione/i);
  // Anche un controsoffitto troppo basso non crea un vuoto utile.
  const low = updateRoom(p, p.rooms[0].id, { ceilingHeightM: 2.6 });
  expect(() =>
    applyFanCoil(low, low.rooms[0].id, "innova-airleaf-sli-200-2t", {
      mounting: "ceiling",
    }),
  ).toThrow(/posizione/i);
});

it("hangs a flat exposed unit below the lowest roof point over its footprint", () => {
  const empty = fixture();
  const p = updateRoom(empty, empty.rooms[0].id, {
    roof: { ridgeWallId: empty.rooms[0].wallIds[0], ridgeHeightM: 3.3 },
  });
  const placed = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
    mounting: "ceiling",
  });
  const unit = placed.fanCoils![0],
    body = fanCoilEnvelope(unit);
  const lowest = Math.min(
    ...footprintCorners(
      unit.position,
      unit.widthMm / 1000,
      unit.heightMm / 1000,
      unit.rotation,
    ).map((point) => roofHeightAt(p, p.rooms[0], point)),
  );
  expect(body.maxZ).toBeCloseTo(lowest);
  expect(fanCoilPlacementValid(placed, unit)).toBe(true);
});

it("retains saved historical poses and reports a body extending into the structural ceiling", () => {
  let p = fixture();
  p = parseProject(
    applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
      mounting: "ceiling",
    }),
  );
  p.fanCoils![0].elevationM = 2.7;
  const before = structuredClone(p.fanCoils);
  const loaded = decodeProject(encodeProject(p));
  expect(loaded.fanCoils).toEqual(before);
  expect(fanCoilPlacementValid(loaded, loaded.fanCoils![0])).toBe(false);
  expect(validateProject(loaded)).toContainEqual(
    expect.objectContaining({
      code: "deviceEnvelope",
      entityId: loaded.fanCoils![0].id,
      status: "invalid",
    }),
  );
});

it("retains a chosen hanging offset while moving horizontally", () => {
  let p = fixture();
  p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
    mounting: "ceiling",
  });
  const unit = p.fanCoils![0];
  p = updateFanCoil(p, unit.id, { elevationM: 2.52 });
  expect(recomputeProject(p).fanCoils![0].elevationM).toBeCloseTo(2.52);
  expect(decodeProject(encodeProject(p)).fanCoils![0].elevationM).toBeCloseTo(
    2.52,
  );
  const moved = movePlacedDevice(p, unit.id, { x: 2, y: 3 });
  expect(moved.fanCoils![0].elevationM).toBeCloseTo(2.52);
});

it("keeps the published 2500 mm SL horizontal clearance and its original manual", () => {
  const p = fixture();
  const product = fanCoilCatalog.products.find(
    (p) => p.id === "innova-airleaf-sl-200-2t",
  )!;
  expect(product.ceilingInstallation).toMatchObject({
    minFaceHeightM: 2.5,
    sourceMetadata: {
      page: 20,
      sha256:
        "6bfca9ab505b3361f409f08ce065ba3434eab6cc584ffa2d93e8a64213668b62",
    },
  });
  const concealed = fanCoilCatalog.products.find(
    (p) => p.id === "innova-airleaf-sli-200-2t",
  )!;
  expect(concealed.ceilingInstallation).toMatchObject({
    minFaceHeightM: 2.5,
    sourceMetadata: {
      page: 24,
      sha256:
        "8b390134968004d1bba2cac000708a070c24b580dbd93f1e18947908e8800d71",
    },
  });
  const low = updateRoom(p, p.rooms[0].id, { ceilingHeightM: 2.6 });
  expect(() =>
    applyFanCoil(low, low.rooms[0].id, product.id, { mounting: "ceiling" }),
  ).toThrow(/posizione/i);
  expect(
    fanCoilProductAtVersion(product.id, "fan-coils-d073b172b15846c0")
      ?.ceilingInstallation,
  ).toBeUndefined();
  const placed = applyFanCoil(p, p.rooms[0].id, product.id, {
    mounting: "ceiling",
  });
  expect(installedTechnicalSheets(placed).documents).toContainEqual(
    expect.objectContaining({
      source: expect.objectContaining({
        sha256: product.ceilingInstallation!.sourceMetadata.sha256,
      }),
      pages: [20],
    }),
  );
  expect(buildDossier(placed).sources).toContainEqual(
    expect.objectContaining({
      sha256: product.ceilingInstallation!.sourceMetadata.sha256,
    }),
  );
  placed.fanCoils![0].elevationM = 2.4;
  expect(validateProject(placed)).toContainEqual(
    expect.objectContaining({
      code: "fanCoilCeiling",
      entityId: placed.fanCoils![0].id,
      status: "invalid",
    }),
  );
});

it("supports adjacent finished bands and rejects a gap under a concealed body", () => {
  const p = fixture(),
    room = p.rooms[0];
  const product = fanCoilCatalog.products.find(
    (p) => p.id === "innova-airleaf-sli-200-2t",
  )!;
  const bands = [
    {
      id: "left",
      name: "Sinistra",
      wallId: room.wallIds[0],
      offsetM: 0,
      lengthM: 4,
      depthM: 4,
      elevationM: 2.2,
    },
    {
      id: "right",
      name: "Destra",
      wallId: room.wallIds[0],
      offsetM: 4,
      lengthM: 4,
      depthM: 4,
      elevationM: 2.2,
    },
  ];
  const joined = updateRoom(p, room.id, { ceilingBands: bands });
  expect(
    fanCoilCeilingRange(joined, joined.rooms[0], product, { x: 4, y: 3 })
      ?.defaultM,
  ).toBe(2.5);
  const gap = updateRoom(p, room.id, {
    ceilingBands: bands.map((b, i) => ({
      ...b,
      offsetM: i ? 4.01 : 0,
      lengthM: 3.99,
    })),
  });
  expect(
    fanCoilCeilingRange(gap, gap.rooms[0], product, { x: 4, y: 3 }),
  ).toBeNull();
});

it("keeps wall and horizontal units separate in the bill of materials", () => {
  let p = fixture();
  p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
    mounting: "wall",
  });
  p = applyFanCoil(p, p.rooms[0].id, "innova-airleaf-sl-200-2t", {
    mounting: "ceiling",
  });
  const items = buildDossier(p).materials.filter(
    (item) => item.description === "Innova AirLeaf SL SL 200",
  );
  expect(items).toHaveLength(2);
  expect(items.map((item) => item.quantity)).toEqual([1, 1]);
  expect(items.map((item) => item.details)).toContainEqual(
    expect.stringMatching(/^parete;/),
  );
  expect(items.map((item) => item.details)).toContainEqual(
    expect.stringMatching(/^soffitto;.*2500/),
  );
});
