import { expect, it } from "vitest";
import {
  archivedDocument,
  reportUnarchived,
  sha256File,
} from "./archived-sources";
import { splitCatalog } from "./splits";

const climanext = splitCatalog.combinations.filter(
  (c) =>
    c.manufacturer === "LG" &&
    c.sourceMetadata.sourceUrl.includes("climanext.net/wp-content"),
);

it("integra i 13 monosplit LG delle schede Climanext con misure interna ed esterna", () => {
  expect(climanext).toHaveLength(13);
  expect(
    climanext.filter((c) => c.outdoorModel.startsWith("A")).length,
  ).toBeGreaterThan(0);
  for (const combo of climanext) {
    const indoor = splitCatalog.indoorUnits.find(
      (u) => u.id === combo.indoorProductIds[0],
    )!;
    const outdoor = splitCatalog.outdoorUnits.find(
      (u) => u.manufacturer === "LG" && u.model === combo.outdoorModel,
    );
    expect(outdoor, combo.id).toBeDefined();
    expect(indoor.nominalCoolingW).toBe(combo.coolingCapacityW);
    expect(indoor.widthMm).toBeGreaterThan(600);
  }
});

it("lega ogni monosplit Climanext ai byte esatti della scheda archiviata", () => {
  const missing: string[] = [];
  for (const combo of climanext) {
    const key = combo.sourceMetadata.sourceUrl.split("/").pop()!;
    const file = archivedDocument(
      combo.sourceMetadata.sha256,
      `catalog-data/sources/splits/lg-climanext/${key}`,
    );
    if (file)
      expect(sha256File(file).toUpperCase()).toBe(combo.sourceMetadata.sha256);
    else missing.push(key);
  }
  reportUnarchived(missing);
});
