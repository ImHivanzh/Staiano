import { expect, it } from "vitest";
import {
  radiatorProducts,
  radiatorCatalogAtVersion,
} from "../catalogs/radiators";
import { radiatorFamilyGroup, radiatorSizeChoices } from "./catalog-selection";
import { sizeRadiators } from "./size";
import { applyRadiatorSolution } from "./apply";
import { addRectangle, createProject } from "../project";

it("espone tutte le 27 altezze Ardesia in ordine con interasse verificato", () => {
  const ardesia = radiatorProducts.filter(
    (product) => radiatorFamilyGroup(product.family) === "Ardesia",
  );
  const choices = radiatorSizeChoices(ardesia);
  expect(choices).toHaveLength(27);
  expect(
    choices.every(
      (choice, index) =>
        choice.interaxisMm === choice.heightMm - 56 &&
        (index === 0 || choices[index - 1].heightMm < choice.heightMm),
    ),
  ).toBe(true);
  expect(choices).toContainEqual({ heightMm: 556, interaxisMm: 500 });
  expect(choices).toContainEqual({ heightMm: 1856, interaxisMm: 1800 });
});

it("salva la versione del catalogo che contiene il modello Cordivari scelto", () => {
  const product = radiatorProducts.find((item) => item.family === "Claudia")!;
  let project = createProject();
  project = addRectangle(project, project.floors[0].id, {
    width: 6,
    length: 6,
    height: 3,
    name: "Bagno",
  });
  const solution = sizeRadiators(1, [product], 50, {
    family: product.family,
    manufacturer: product.manufacturer,
    numberOfRadiators: 1,
  })[0];
  const result = applyRadiatorSolution(
    project,
    project.rooms[0].id,
    solution,
    null,
    undefined,
    true,
  );
  const saved = result.radiators[0];
  expect(
    radiatorCatalogAtVersion(saved.catalogVersion)?.products.some(
      (item) => item.id === saved.productId,
    ),
  ).toBe(true);
});
