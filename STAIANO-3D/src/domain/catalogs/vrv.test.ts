import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivedDocument, reportUnarchived, sha256File } from "./archived-sources";
import { vrvCatalog, vrvCatalogAtVersion } from "./vrv";

describe("official Daikin VRV/VRF catalogue", () => {
  it("covers the reviewed VRV IV S, mini VRV and VRV 5 S outdoor units", () => {
    expect(vrvCatalog.outdoorUnits).toHaveLength(18);
    expect(
      vrvCatalog.outdoorUnits.filter(
        (unit) => unit.family === "VRV IV S Compact",
      ),
    ).toHaveLength(3);
    expect(
      vrvCatalog.outdoorUnits.filter((unit) => unit.family === "VRV IV S"),
    ).toHaveLength(9);
    expect(
      vrvCatalog.outdoorUnits.filter((unit) => unit.family === "VRV 5 S"),
    ).toHaveLength(6);
  });
  it("uses published capacities, connection ratios and dimensions", () => {
    const vrv5 = vrvCatalog.outdoorUnits.find(
      (unit) => unit.id === "daikin-rxysa6ay1",
    )!;
    expect(vrv5).toMatchObject({
      coolingW: 15500,
      heatingW: 15500,
      maxHeatingW: 18000,
      minConnectionRatio: 50,
      maxConnectionRatio: 130,
    });
    expect([vrv5.widthMm, vrv5.heightMm, vrv5.depthMm]).toEqual([
      869, 1100, 460,
    ]);
    expect(vrv5.sourceMetadata.page).toBe(111);
    const vrv4 = vrvCatalog.outdoorUnits.find(
      (unit) => unit.id === "daikin-rxysq12ty1",
    )!;
    expect([vrv4.widthMm, vrv4.heightMm, vrv4.depthMm]).toEqual([
      1615, 940, 460,
    ]);
    expect(vrv4.coolingW).toBe(33500);
    expect(vrv4.sourceMetadata.page).toBe(108);
  });
  it("keeps wall indoor units on their published capacity classes", () => {
    expect(vrvCatalog.indoorUnits).toHaveLength(7);
    expect(
      vrvCatalog.indoorUnits.map((unit) => [
        unit.model,
        unit.nominalCoolingW,
        unit.nominalHeatingW,
      ]),
    ).toEqual([
      ["FXAA15A", 1700, 1900],
      ["FXAA20A", 2200, 2500],
      ["FXAA25A", 2800, 3200],
      ["FXAA32A", 3600, 4000],
      ["FXAA40A", 4500, 5000],
      ["FXAA50A", 5600, 6300],
      ["FXAA63A", 7100, 8000],
    ]);
    expect(
      vrvCatalog.indoorUnits.find((unit) => unit.model === "FXAA63A"),
    ).toMatchObject({ widthMm: 1050, heightMm: 290, depthMm: 269 });
  });
  it("pins documents and photos, and preserves archived revisions", () => {
    const archived = archivedDocument(
      vrvCatalog.outdoorUnits[0].sourceMetadata.sha256,
      "catalog-data/sources/hvac/daikin-residential-2025.pdf",
    );
    if (archived)
      expect(sha256File(archived)).toBe(
        vrvCatalog.outdoorUnits[0].sourceMetadata.sha256,
      );
    else reportUnarchived(["daikin-residential-2025.pdf"]);
    for (const unit of [
      ...vrvCatalog.outdoorUnits,
      ...vrvCatalog.indoorUnits,
    ])
      expect(sha256File(join("public", unit.productPhoto.localPath))).toBe(
        unit.productPhoto.sha256,
      );
    expect(vrvCatalogAtVersion("missing-version")).toBeNull();
  });
});
