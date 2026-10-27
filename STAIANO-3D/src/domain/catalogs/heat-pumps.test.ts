import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  archivedDocument,
  reportUnarchived,
  sha256File,
} from "./archived-sources";
import { heatPumpCatalog, heatPumpCatalogAtVersion } from "./heat-pumps";

describe("official Daikin Altherma outdoor catalogue", () => {
  const daikin = heatPumpCatalog.products.filter(
    (p) => p.manufacturer === "Daikin",
  );
  it("covers every reviewed outdoor range, size and power supply", () => {
    expect(daikin).toHaveLength(32);
    expect(
      daikin.filter((p) => p.family === "Altherma 3 R").map((p) => p.model),
    ).toEqual([
      "ERGA04EV",
      "ERGA06EVH",
      "ERGA08EVH7",
      "ERLA11DV3",
      "ERLA11DW1",
      "ERLA14DV3",
      "ERLA14DW1",
      "ERLA16DV37",
      "ERLA16DW17",
    ]);
    expect(
      daikin.filter((p) => p.family === "Altherma 3 R MT").map((p) => p.model),
    ).toEqual([
      "ERRA08EV3",
      "ERRA08EW1",
      "ERRA10EV3",
      "ERRA10EW1",
      "ERRA12EV3",
      "ERRA12EW1",
    ]);
    expect(
      daikin.filter((p) => p.family === "Altherma 3 H HT").map((p) => p.model),
    ).toEqual([
      "EPRA14DV37",
      "EPRA14DW17",
      "EPRA16DV37",
      "EPRA16DW17",
      "EPRA18DV37",
      "EPRA18DW17",
    ]);
  });
  it("keeps documented dimensions and source pages for each range", () => {
    for (const product of daikin.filter((p) => p.family === "Altherma 3 R MT"))
      expect([product.widthMm, product.heightMm, product.depthMm]).toEqual([
        1003, 1270, 533,
      ]);
    for (const product of daikin.filter((p) => p.family === "Altherma 3 H HT"))
      expect(product.sourceMetadata.page).toBe(174);
    const archived = archivedDocument(
      daikin[0].sourceMetadata.sha256,
      "catalog-data/sources/hvac/daikin-residential-2025.pdf",
    );
    if (archived)
      expect(sha256File(archived)).toBe(daikin[0].sourceMetadata.sha256);
    else reportUnarchived(["daikin-residential-2025.pdf"]);
    for (const product of daikin)
      expect(sha256File(join("public", product.productPhoto.localPath))).toBe(
        product.productPhoto.sha256,
      );
  });
});

describe("complete official Gree VERSATI catalog", () => {
  const gree = heatPumpCatalog.products.filter(
    (p) => p.manufacturer === "Gree",
  );
  it("covers every current family, size and power supply in the official listing", () => {
    expect(gree).toHaveLength(18);
    expect(
      gree.filter((p) => p.family === "VERSATI V").map((p) => p.id),
    ).toEqual(
      [6, 8, 10, 12, 14, 16].flatMap((size) => [
        `gree-versati-v-${size}-monofase`,
        ...(size >= 10 ? [`gree-versati-v-${size}-trifase`] : []),
      ]),
    );
    for (const configuration of ["split", "all-in-one"]) {
      expect(
        gree
          .filter((p) => p.id.includes(`-${configuration}-`))
          .map((p) => p.id),
      ).toEqual(
        [4, 6, 8, 10].map(
          (size) => `gree-versati-iii-${size}-${configuration}-monofase`,
        ),
      );
    }
    const listing =
      "catalog-data/sources/heat-pumps/gree-versati-products-details.html";
    if (existsSync(listing))
      expect(
        readFileSync(listing, "utf8").match(
          /<a href="prodotti.php\?prodgroup=IDRO&CodArt=/g,
        ),
      ).toHaveLength(18);
    else reportUnarchived([listing]);
  });
  it("uses actual nominal capacity and dimensions for the two-fan 16 kW model", () => {
    for (const phase of ["monofase", "trifase"]) {
      const p = gree.find((p) => p.id === `gree-versati-v-16-${phase}`)!;
      expect([p.widthMm, p.heightMm, p.depthMm]).toEqual([943, 1615, 464]);
      expect(
        p.operatingPoints.map((p) => [p.heatingW, p.coolingW, p.cop, p.eer]),
      ).toEqual([
        [15500, 14000, 4.7, 2.85],
        [15500, 14000, 3.75, 2.85],
      ]);
    }
  });
  it("keeps Split and All In One performance separate and pins official documents and images", () => {
    expect(
      gree.find((p) => p.id === "gree-versati-iii-8-split-monofase")!
        .operatingPoints[0].eer,
    ).toBe(3);
    expect(
      gree.find((p) => p.id === "gree-versati-iii-8-all-in-one-monofase")!
        .operatingPoints[0].eer,
    ).toBe(3.1);
    const unarchived = new Set<string>();
    for (const p of gree) {
      const document =
        p.family === "VERSATI V"
          ? "gree-versati-v"
          : p.family.endsWith("Split")
            ? "gree-versati-iii"
            : "gree-versati-iii-all-in-one";
      const archived = archivedDocument(
        p.sourceMetadata.sha256,
        `catalog-data/sources/heat-pumps/${document}.pdf`,
      );
      if (archived)
        expect(sha256File(archived), document).toBe(p.sourceMetadata.sha256);
      else unarchived.add(`${document}.pdf`);
      expect(sha256File(join("public", p.productPhoto.localPath))).toBe(
        p.productPhoto.sha256,
      );
    }
    reportUnarchived([...unarchived]);
  });
  it("preserves previous catalog data while adding documented maximum outputs", () => {
    for (const version of [
      "heat-pumps-dd01394cdc900d50",
      "heat-pumps-6b5487027be7da66",
    ]) {
      const previous = heatPumpCatalogAtVersion(version)!;
      for (const p of previous.products)
        expect(
          heatPumpCatalog.products.find((current) => current.id === p.id),
        ).toMatchObject(p);
    }
  });
});

describe("heat pump 3D models", () => {
  it("maps every catalogue product to an existing Blender GLB", async () => {
    const { heatPumpModelUrl } = await import("./heat-pump-models");
    for (const p of heatPumpCatalog.products) {
      const url = heatPumpModelUrl(p);
      expect(url, p.id).not.toBeNull();
      expect(existsSync(join(process.cwd(), "public", url!)), p.id).toBe(true);
    }
  });
});
