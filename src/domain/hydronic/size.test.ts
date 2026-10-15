import { expect, it } from "vitest";
import { addRectangle, createProject } from "../project";
import { recommendedHeatPump } from "./size";
import { heatPumpCatalog } from "../catalogs/heat-pumps";

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
  const rating = model.operatingPoints[1];
  expect(rating.heatingW).toBeGreaterThanOrEqual(project.rooms[0].designLoadW);
  expect(rating.coolingW).toBeGreaterThanOrEqual(project.rooms[0].designLoadW);
  const suitable = heatPumpCatalog.products.filter(
    (product) =>
      product.manufacturer === options.manufacturer &&
      product.operatingPoints[1].heatingW >= project.rooms[0].designLoadW &&
      product.operatingPoints[1].coolingW >= project.rooms[0].designLoadW,
  );
  expect(Math.min(rating.heatingW, rating.coolingW)).toBe(
    Math.min(
      ...suitable.map((product) =>
        Math.min(
          product.operatingPoints[1].heatingW,
          product.operatingPoints[1].coolingW,
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
  expect(smallModel.operatingPoints[1].coolingW).toBeLessThanOrEqual(
    rating.coolingW,
  );
});
