import { expect, it } from "vitest";
import { addRectangle, createProject } from "../project";
import { recommendedHeatPump } from "./size";
import { heatPumpCatalog, heatPumpCapacity } from "../catalogs/heat-pumps";
import { applyHydronicSystem } from "./apply";
import { validateHydronicSystem } from "./validation";
import { buildDossier } from "@/services/pdf/dossier";

it("recommends a pump that covers heat and cooling at the selected conditions and fits the chosen position", () => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Stanza",
  });
  const options = {
    manufacturer: "Chaffoteaux",
    roomIds: [project.rooms[0].id],
    operatingPointIndex: 1,
    position: { x: 4, y: -0.7 },
  };
  const model = recommendedHeatPump(project, project.floors[0].id, options)!;
  expect(model).not.toBeNull();
  expect(model.model).toContain("LITE");
  const rating = heatPumpCapacity(model.operatingPoints[1]);
  expect(rating.heatingW).toBeGreaterThanOrEqual(project.rooms[0].designLoadW);
  expect(rating.coolingW).toBeGreaterThanOrEqual(project.rooms[0].designLoadW);
  const suitable = heatPumpCatalog.products.filter(
    (product) =>
      product.manufacturer === options.manufacturer &&
      heatPumpCapacity(product.operatingPoints[1]).heatingW >=
        project.rooms[0].designLoadW &&
      heatPumpCapacity(product.operatingPoints[1]).coolingW >=
        project.rooms[0].designLoadW,
  );
  expect(Math.min(rating.heatingW, rating.coolingW)).toBe(
    Math.min(
      ...suitable.map((product) =>
        Math.min(
          heatPumpCapacity(product.operatingPoints[1]).heatingW,
          heatPumpCapacity(product.operatingPoints[1]).coolingW,
        ),
      ),
    ),
  );
  expect(
    recommendedHeatPump(project, project.floors[0].id, {
      ...options,
      position: { x: 4, y: 3 },
    }),
  ).toBeNull();
  expect(
    recommendedHeatPump(project, project.floors[0].id, {
      ...options,
      roomIds: [],
    }),
  ).toBeNull();
  const smaller = {
    ...project,
    rooms: project.rooms.map((room) => ({ ...room, designLoadW: 2000 })),
  };
  const smallModel = recommendedHeatPump(
    smaller,
    project.floors[0].id,
    options,
  )!;
  expect(
    heatPumpCapacity(smallModel.operatingPoints[1]).coolingW,
  ).toBeLessThanOrEqual(rating.coolingW);
});

it("uses the manufacturer's maximum outputs separately for heating and cooling", () => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Stanza",
  });
  project.rooms[0].designLoadW = 3700;
  const options = {
    manufacturer: "Chaffoteaux",
    roomIds: [project.rooms[0].id],
    operatingPointIndex: 1,
    position: { x: 4, y: -0.7 },
  };
  const model = recommendedHeatPump(project, project.floors[0].id, options)!;
  expect(model.id).toBe("chaffoteaux-arianext-lite-35-m-r32");
  expect(model.operatingPoints[1]).toMatchObject({
    heatingW: 3000,
    coolingW: 3500,
    maxHeatingW: 6040,
    maxCoolingW: 3810,
  });
  const installed = applyHydronicSystem(project, {
    productId: model.id,
    roomIds: options.roomIds,
    fanCoilIds: [],
    operatingPointIndex: 1,
  });
  expect(
    validateHydronicSystem(installed, installed.hydronicSystems![0]),
  ).toMatchObject({
    heatingW: 6040,
    coolingW: 3810,
    capacityCovered: true,
    capacityBasis: "massime dichiarate",
  });
  expect(
    buildDossier(installed).materials.find((row) =>
      row.description.includes(model.model),
    )?.details,
  ).toContain("6040 W caldo / 3810 W freddo; potenze massime dichiarate");
  const historical = structuredClone(installed);
  historical.hydronicSystems![0].catalogVersion = "heat-pumps-9e3730348d934831";
  expect(
    validateHydronicSystem(historical, historical.hydronicSystems![0])
      .capacityCovered,
  ).toBe(false);
  const updated = applyHydronicSystem(historical, {
    systemId: historical.hydronicSystems![0].id,
    productId: model.id,
    catalogVersion: heatPumpCatalog.version,
    roomIds: options.roomIds,
    fanCoilIds: [],
    operatingPointIndex: 1,
  });
  expect(updated.hydronicSystems![0].catalogVersion).toBe(
    heatPumpCatalog.version,
  );
  expect(
    validateHydronicSystem(updated, updated.hydronicSystems![0])
      .capacityCovered,
  ).toBe(true);
  project.rooms[0].designLoadW = 7800;
  const larger = recommendedHeatPump(project, project.floors[0].id, options)!;
  expect(larger.operatingPoints[1].maxHeatingW).toBeGreaterThanOrEqual(7800);
  expect(larger.operatingPoints[1].maxCoolingW).toBeGreaterThanOrEqual(7800);
});
