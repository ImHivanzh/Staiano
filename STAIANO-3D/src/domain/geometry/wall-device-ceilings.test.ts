import { ensureInstallations } from "../installations";
import { expect, it } from "vitest";
import { createProject, addRectangle, recomputeProject } from "../project";
import { radiatorProducts } from "../catalogs/radiators";
import { sizeRadiators } from "../radiators/size";
import { applyRadiatorSolution } from "../radiators/apply";
import { applyFanCoil, updateFanCoil } from "../fan-coils/apply";
import {
  fanCoilPlacementValid,
  fanCoilCeilingRange,
} from "../fan-coils/placement";
import { fanCoilProductAtVersion } from "../catalogs/fan-coils";
import { movePlacedDevice } from "./move-device";
import { roomWallSpan } from "./placement";
import { validateProject } from "../validation";
import { minimumCeilingHeightM } from "./ceilings";
import { deviceEnvelope } from "./device-envelope";
function roomProject(height = 2.7) {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 8,
    length: 6,
    height,
    name: "Sala",
  });
}
function radiator(
  p: ReturnType<typeof roomProject>,
  wallId: string | null = null,
) {
  const product = radiatorProducts.find(
    (p) => p.id === "cordivari-ardesia-2-2500",
  )!;
  const solution = sizeRadiators(p.rooms[0].designLoadW, [product], 50, {
    manufacturer: product.manufacturer,
    family: product.family,
    numberOfRadiators: 1,
  })[0];
  expect(solution).toBeDefined();
  return ensureInstallations(
    applyRadiatorSolution(p, p.rooms[0].id, solution, wallId),
  );
}
it("rejects radiator insertion and movement above the finished ceiling while preserving saved records", () => {
  const placed = radiator(roomProject()),
    unit = placed.radiators[0];
  const p = {
    ...placed,
    rooms: placed.rooms.map((room) => ({ ...room, ceilingHeightM: 2.4 })),
  };
  expect(validateProject(p)).toContainEqual(
    expect.objectContaining({
      code: "deviceEnvelope",
      status: "invalid",
      entityId: unit.id,
    }),
  );
  expect(recomputeProject(p).radiators).toEqual(p.radiators);
  expect(() => movePlacedDevice(p, unit.id, unit.position)).toThrow(/soffitto/);
  expect(() => radiator(p)).toThrow(/soffitto/);
});
it("detects a low band inside a radiator footprint and searches another free position on the same wall", () => {
  const placed = radiator(roomProject()),
    unit = placed.radiators[0],
    room = placed.rooms[0],
    wall = placed.walls.find((w) => w.id === unit.wallId)!,
    span = roomWallSpan(room, wall)!;
  const along =
    ((unit.position.x - span.start.x) * (span.end.x - span.start.x) +
      (unit.position.y - span.start.y) * (span.end.y - span.start.y)) /
    span.lengthM;
  const p = {
    ...placed,
    rooms: placed.rooms.map((r) => ({
      ...r,
      ceilingBands: [
        {
          id: "narrow-rad-band",
          name: "Fascia",
          wallId: wall.id,
          offsetM: along + unit.widthMm / 4000,
          lengthM: unit.widthMm / 8000,
          depthM: 0.8,
          elevationM: 2.59,
        },
      ],
    })),
  };
  expect(validateProject(p)).toContainEqual(
    expect.objectContaining({
      code: "deviceEnvelope",
      status: "invalid",
      entityId: unit.id,
    }),
  );
  expect(() => movePlacedDevice(p, unit.id, unit.position)).toThrow(/soffitto/);
  const next = radiator(p, wall.id),
    moved = next.radiators[0],
    envelope = deviceEnvelope(next, moved.id)!;
  expect(moved.wallId).toBe(wall.id);
  expect(moved.position).not.toEqual(unit.position);
  expect(envelope.maxZ).toBeLessThanOrEqual(
    minimumCeilingHeightM(next, next.rooms[0], envelope.cornersXY) + 1e-7,
  );
});
it("uses the real gable clearance rather than rejecting a tall radiator against the lower eaves height", () => {
  const p = roomProject(2.2),
    room = p.rooms[0];
  room.roof = { ridgeWallId: room.wallIds[0], ridgeHeightM: 3.8 };
  const next = radiator(p, room.wallIds[1]),
    unit = next.radiators[0],
    envelope = deviceEnvelope(next, unit.id)!;
  expect(envelope.maxZ).toBeGreaterThan(room.heightM);
  expect(envelope.maxZ).toBeLessThanOrEqual(
    minimumCeilingHeightM(next, next.rooms[0], envelope.cornersXY) + 1e-7,
  );
});
it.each(["innova-airleaf-sl-200-2t", "innova-airleaf-sli-200-2t"])(
  "checks wall-unit clearance for %s while allowing a concealed unit entirely inside a technical void",
  (id) => {
    const empty = roomProject(3.6);
    let p = installedFanCoil(empty, empty.rooms[0].id, id, 0, {
      mounting: "wall",
    });
    p = { ...p, rooms: p.rooms.map((r) => ({ ...r, ceilingHeightM: 2.8 })) };
    const unit = {
      ...p.fanCoils![0],
      elevationM: 2.9 + p.fanCoils![0].heightMm / 2000,
    };
    expect(fanCoilPlacementValid(p, unit)).toBe(id.includes("-sli-"));
    const crossing = { ...unit, elevationM: 2.8 };
    expect(fanCoilPlacementValid(p, crossing)).toBe(false);
    expect(() => updateFanCoil(p, unit.id, { elevationM: 2.8 })).toThrow();
  },
);
it("rejects moving an exposed wall fan under a band and reports an unchanged invalid saved pose", () => {
  const empty = roomProject();
  let p = installedFanCoil(
    empty,
    empty.rooms[0].id,
    "innova-airleaf-sl-200-2t",
    0,
    { mounting: "wall" },
  );
  const unit = { ...p.fanCoils![0], elevationM: 2.3 };
  p = { ...p, fanCoils: [unit] };
  const room = p.rooms[0],
    wall = p.walls.find((w) => w.id === unit.wallId)!,
    span = roomWallSpan(room, wall)!;
  p = {
    ...p,
    rooms: p.rooms.map((r) => ({
      ...r,
      ceilingBands: [
        {
          id: "wall-fan-band",
          name: "Fascia",
          wallId: wall.id,
          offsetM: 0,
          lengthM: span.lengthM,
          depthM: 1,
          elevationM: 2.5,
        },
      ],
    })),
  };
  expect(fanCoilPlacementValid(p, unit)).toBe(false);
  expect(() => movePlacedDevice(p, unit.id, unit.position)).toThrow(
    /soffitto|quota/i,
  );
  expect(validateProject(p)).toContainEqual(
    expect.objectContaining({
      code: "fanCoilCeiling",
      status: "invalid",
      entityId: unit.id,
    }),
  );
  expect(recomputeProject(p).fanCoils).toEqual(p.fanCoils);
});
it("separates a band's void from the upper void instead of allowing a concealed body to cross the central plane", () => {
  const empty = roomProject(3.2);
  empty.rooms[0].ceilingHeightM = 2.8;
  const wall = empty.walls.find((w) => w.id === empty.rooms[0].wallIds[0])!,
    span = roomWallSpan(empty.rooms[0], wall)!;
  empty.rooms[0].ceilingBands = [
    {
      id: "full-band",
      name: "Fascia",
      wallId: wall.id,
      offsetM: 0,
      lengthM: span.lengthM,
      depthM: 6,
      elevationM: 2.5,
    },
  ];
  const p = installedFanCoil(
      empty,
      empty.rooms[0].id,
      "innova-airleaf-sli-200-2t",
      0,
      { mounting: "ceiling" },
    ),
    unit = p.fanCoils![0],
    model = fanCoilProductAtVersion(unit.productId, unit.catalogVersion)!;
  const range = fanCoilCeilingRange(
    p,
    p.rooms[0],
    model,
    unit.position,
    unit.rotation,
  )!;
  expect(
    range.ranges.some((zone) => 2.75 >= zone.minM && 2.75 <= zone.maxM),
  ).toBe(false);
  expect(() => updateFanCoil(p, unit.id, { elevationM: 2.75 })).toThrow();
  expect(fanCoilPlacementValid(p, { ...unit, elevationM: 2.6 })).toBe(true);
  expect(fanCoilPlacementValid(p, { ...unit, elevationM: 2.9 })).toBe(true);
});

function installedFanCoil(...args: Parameters<typeof applyFanCoil>) {
  return ensureInstallations(applyFanCoil(...args));
}
it("keeps a chosen upper-void elevation when moving outside a lower band", () => {
  const empty = roomProject(3.2);
  empty.rooms[0].ceilingHeightM = 2.8;
  const room = empty.rooms[0],
    wall = empty.walls.find((w) => w.id === room.wallIds[0])!,
    span = roomWallSpan(room, wall)!;
  room.ceilingBands = [
    {
      id: "side-band",
      name: "Fascia",
      wallId: wall.id,
      offsetM: 0,
      lengthM: span.lengthM,
      depthM: 4,
      elevationM: 2.5,
    },
  ];
  const p = installedFanCoil(empty, room.id, "innova-airleaf-sli-200-2t", 0, {
      mounting: "ceiling",
    }),
    unit = p.fanCoils![0];
  expect(unit.elevationM).toBe(2.5);
  const raised = updateFanCoil(p, unit.id, { elevationM: 2.9 });
  const moved = movePlacedDevice(raised, unit.id, { x: 4, y: 5.2 });
  expect(moved.fanCoils![0].elevationM).toBeCloseTo(2.9, 7);
  expect(fanCoilPlacementValid(moved, moved.fanCoils![0])).toBe(true);
});

it("does not invent a technical void for a band whose reference wall is missing", () => {
  const empty = roomProject();
  // Il corpo ad incasso si posa solo con un vuoto reale: qui è il controsoffitto.
  empty.rooms[0].ceilingHeightM = 2.4;
  const p = installedFanCoil(
      empty,
      empty.rooms[0].id,
      "innova-airleaf-sli-200-2t",
      0,
      { mounting: "ceiling" },
    ),
    unit = p.fanCoils![0],
    model = fanCoilProductAtVersion(unit.productId, unit.catalogVersion)!;
  p.rooms[0].ceilingHeightM = null;
  p.rooms[0].ceilingBands = [
    {
      id: "orphan-band",
      name: "Fascia",
      wallId: "missing-wall",
      offsetM: 0,
      lengthM: 8,
      depthM: 6,
      elevationM: 2.6,
    },
  ];
  const range = fanCoilCeilingRange(
    p,
    p.rooms[0],
    model,
    unit.position,
    unit.rotation,
  );
  // Nessun vuoto inventato e nessuna posa a vista per un corpo ad incasso.
  expect(range).toBeNull();
});
it("never recommends a quota above the structural shell even when the finished plane needs correction", () => {
  const empty = roomProject();
  const p = installedFanCoil(
      empty,
      empty.rooms[0].id,
      "innova-airleaf-sl-200-2t",
      0,
      { mounting: "ceiling" },
    ),
    unit = p.fanCoils![0],
    model = fanCoilProductAtVersion(unit.productId, unit.catalogVersion)!;
  p.rooms[0].ceilingHeightM = 3;
  const range = fanCoilCeilingRange(
    p,
    p.rooms[0],
    model,
    unit.position,
    unit.rotation,
  )!;
  expect(range.defaultM + unit.depthMm / 1000).toBeLessThanOrEqual(
    p.rooms[0].heightM + 1e-7,
  );
});
