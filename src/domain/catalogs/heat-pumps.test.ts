import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { heatPumpCatalog, heatPumpCatalogAtVersion } from "./heat-pumps";

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
    const listing = readFileSync(
      "catalog-data/sources/heat-pumps/gree-versati-products-details.html",
      "utf8",
    );
    expect(
      listing.match(/<a href="prodotti.php\?prodgroup=IDRO&CodArt=/g),
    ).toHaveLength(18);
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
    for (const p of gree) {
      const document =
        p.family === "VERSATI V"
          ? "gree-versati-v"
          : p.family.endsWith("Split")
            ? "gree-versati-iii"
            : "gree-versati-iii-all-in-one";
      expect(
        createHash("sha256")
          .update(
            readFileSync(`catalog-data/sources/heat-pumps/${document}.pdf`),
          )
          .digest("hex"),
      ).toBe(p.sourceMetadata.sha256);
      expect(
        createHash("sha256")
          .update(readFileSync(`public${p.productPhoto.localPath}`))
          .digest("hex"),
      ).toBe(p.productPhoto.sha256);
    }
  });
  it("preserves every previous catalog model unchanged", () => {
    for (const version of [
      "heat-pumps-dd01394cdc900d50",
      "heat-pumps-6b5487027be7da66",
    ]) {
      const previous = heatPumpCatalogAtVersion(version)!;
      for (const p of previous.products)
        expect(
          heatPumpCatalog.products.find((current) => current.id === p.id),
        ).toEqual(p);
    }
  });
});
