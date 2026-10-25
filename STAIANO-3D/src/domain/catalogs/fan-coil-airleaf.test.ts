import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  fanCoilCatalog,
  fanCoilCatalogAtVersion,
  fanCoilProductAtVersion,
} from "./fan-coils";
import { createProject, addRectangle } from "@/domain/project";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import {
  sizeFanCoils,
  installedFanCoilCapacity,
} from "@/domain/fan-coils/size";
import {
  encodeProject,
  decodeProject,
  parseProject,
} from "@/services/project/format";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";
import rows from "../../../catalog-data/curation/innova-airleaf-2026.json" with { type: "json" };

it("imports all 35 maximum-speed AirLeaf points from the acquired 2026 source", () => {
  expect(
    createHash("sha256")
      .update(
        readFileSync("catalog-data/sources/fan-coils/innova-airleaf-2026.pdf"),
      )
      .digest("hex"),
  ).toBe(rows.sourceMetadata.sha256);
  const products = fanCoilCatalog.products.filter(
    (p) => p.manufacturer === "Innova",
  );
  expect(products).toHaveLength(35);
  for (const product of products) {
    const row = rows.products[product.id as keyof typeof rows.products];
    const point = product.operatingPoints[0];
    expect(product.operatingPoints).toHaveLength(1);
    expect(point.label).toBe("Massima · 0 Pa");
    expect([product.widthMm, product.heightMm, product.depthMm]).toEqual([
      row.widthMm,
      row.heightMm,
      row.depthMm,
    ]);
    expect(point.airflowM3h).toBe(row.airflowM3h);
    expect(point.noiseDbA).toBe(row.noiseDbA);
    expect(point.coolingW).toBeCloseTo(row.coolingW);
    expect(point.heatingW).toBeCloseTo(row.heatingW);
    expect(point.coolingConditions).toContain("0 Pa");
    expect(point.noiseConditions).toContain("distanza 1 m");
    expect(product.sourceMetadata.page).toBe(row.page);
    expect(product.sourceMetadata.sha256).toBe(rows.sourceMetadata.sha256);
  }
  // SL and SLI 600 four-pipe units have different published cooling capacities.
  expect(
    products.find((p) => p.id === "innova-airleaf-sl-600-4-tubi-4t")!
      .operatingPoints[0].coolingW,
  ).toBe(2500);
  expect(
    products.find((p) => p.id === "innova-airleaf-sli-600-4-tubi-4t")!
      .operatingPoints[0].coolingW,
  ).toBe(1970);
  expect(products.find((p) => p.id === "innova-airleaf-rsi-400-2t")).toMatchObject({
    family: "AirLeaf RSI",
    widthMm: 725,
    heightMm: 576,
    depthMm: 126,
    mountings: ["wall"],
  });
  expect(products.find((p) => p.id === "innova-airleaf-slsi-400-2t")).toMatchObject({
    family: "AirLeaf SLSI",
    widthMm: 725,
    heightMm: 376,
    depthMm: 126,
    mountings: ["wall"],
    operatingPoints: [
      { coolingW: 1210, heatingW: 1510, airflowM3h: 228, noiseDbA: 40 },
    ],
  });
});

it("leaves other manufacturers and controls unchanged in the new revision", () => {
  const old = fanCoilCatalogAtVersion("fan-coils-b244c72c5197bef0")!;
  expect(fanCoilCatalog.controls).toEqual(old.controls);
  expect(
    fanCoilCatalog.products.filter(
      (p) => p.manufacturer !== "Innova" && !p.family.startsWith("Bi2 Naked"),
    ),
  ).toEqual(old.products.filter((p) => p.manufacturer !== "Innova"));
  expect(
    fanCoilCatalog.products.filter((p) => p.family.startsWith("Bi2 Naked")),
  ).toHaveLength(14);
});

it("uses the published pressure at maximum speed in noise filtering", () => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    name: "Camera",
  });
  const options = {
    manufacturer: "Innova",
    family: "AirLeaf SL",
    requiredCoolingW: 800,
    requiredHeatingW: 800,
  };
  const previous = fanCoilCatalogAtVersion("fan-coils-b244c72c5197bef0")!;
  expect(
    sizeFanCoils(project, project.rooms[0], options, previous),
  ).toContainEqual(
    expect.objectContaining({
      product: expect.objectContaining({ id: "innova-airleaf-sl-200-2t" }),
      noiseUnverified: true,
    }),
  );
  expect(project.projectSettings.maxNoiseDbA).toBe(37);
  expect(sizeFanCoils(project, project.rooms[0], options)).toEqual([]);
  expect(
    fanCoilCatalog.products.find((p) => p.id === "innova-airleaf-sl-200-2t")!
      .operatingPoints[0].noiseDbA,
  ).toBe(41);
});

it("preserves historic unknown flow and noise through save/reload, exports the new source for new units", () => {
  const empty = createProject();
  const room = addRectangle(empty, empty.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    name: "Camera",
  });
  const project = parseProject(
    applyFanCoil(room, room.rooms[0].id, "innova-airleaf-sl-200-2t", 0),
  );
  expect(installedTechnicalSheets(project).documents).toContainEqual(
    expect.objectContaining({
      source: expect.objectContaining({ sha256: rows.sourceMetadata.sha256 }),
      pages: [40],
    }),
  );
  project.fanCoils![0].catalogVersion = "fan-coils-b244c72c5197bef0";
  const original = structuredClone(project.fanCoils);
  const loaded = decodeProject(encodeProject(project));
  expect(loaded.fanCoils).toEqual(original);
  const old = fanCoilProductAtVersion(
    loaded.fanCoils![0].productId,
    loaded.fanCoils![0].catalogVersion,
  )!;
  expect(old.operatingPoints[0].airflowM3h).toBeNull();
  expect(old.operatingPoints[0].noiseDbA).toBeNull();
  expect(installedFanCoilCapacity(loaded, room.rooms[0].id)).toMatchObject({
    coolingW: 910,
    heatingW: 1020,
    unknownCount: 0,
  });
  expect(
    installedTechnicalSheets(loaded).documents.some(
      (doc) => doc.source.sha256 === rows.sourceMetadata.sha256,
    ),
  ).toBe(false);
});
