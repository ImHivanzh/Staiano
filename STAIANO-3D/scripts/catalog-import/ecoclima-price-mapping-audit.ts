import { writeFileSync } from "node:fs";
import { airTerminalCatalog } from "../../src/domain/catalogs/air-terminals";
import { ecoclimaPriceCatalog } from "../../src/domain/catalogs/ecoclima-prices";
import { commercialChoicesForTerminal } from "../../src/domain/air-terminals/commercial-bom";
import type { Project } from "../../src/schemas/project";
const rows = airTerminalCatalog.families.map((family) => {
  let matched = 0,
    total = 0;
  for (const variant of family.variants) {
    const lengths = family.isLinearPerMeter
      ? variant.commercialLengthsMm
      : [variant.lengthMm ?? variant.widthMm ?? variant.nominalDiameterMm ?? 1];
    for (const length of lengths) {
      total++;
      const terminal = {
        id: "audit",
        family: family.familyCode,
        productId: variant.id,
        catalogVersion: airTerminalCatalog.version,
        widthMm: length,
        legacyUnverified: false,
        use: family.use.includes("supply") ? "supply" : "return",
      } as Project["airTerminals"][number];
      if (commercialChoicesForTerminal(terminal).length) matched++;
    }
  }
  return {
    familyCode: family.familyCode,
    configurations: total,
    matchedConfigurations: matched,
  };
});
const report = {
  priceVersion: ecoclimaPriceCatalog.version,
  technicalVersion: airTerminalCatalog.version,
  rows,
  unmappedFamilies: rows
    .filter((row) => row.matchedConfigurations === 0)
    .map((row) => row.familyCode),
};
writeFileSync(
  "catalog-data/generated/ecoclima-price-mapping-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    families: rows.length,
    matchedFamilies: rows.filter((row) => row.matchedConfigurations > 0).length,
    unmappedFamilies: report.unmappedFamilies,
  }),
);
