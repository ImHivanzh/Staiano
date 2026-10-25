import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import extra from "../../../catalog-data/curation/split-series-extra.json";
import historical from "../../../catalog-data/generated/splits-history.json";
import { archivedDocument, reportUnarchived } from "./archived-sources";
import {
  splitCatalog,
  splitCatalogAtVersion,
  splitCombinationAtVersion,
} from "./splits";
import {
  splitPresentation,
  splitSeriesPresentations,
  splitUnitPresentation,
} from "./split-presentation";

const hash = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

describe("documented split series", () => {
  it("provides original, local and hash-verified photos for every selectable family", () => {
    for (const unit of splitCatalog.indoorUnits) {
      const series = splitUnitPresentation(unit);
      expect(series, `${unit.manufacturer} ${unit.family}`).not.toBeNull();
      const photo = series!.productPhoto;
      expect(hash(join(process.cwd(), "public", photo.localPath))).toBe(
        photo.sha256,
      );
      expect(series!.features.length).toBeGreaterThan(0);
    }
    expect(splitPresentation("unpublished-series")).toBeNull();
    expect(splitPresentation("Emura", "Gree")).toBeNull();
  });

  it("ties all acquired series facts to exact archived source bytes", () => {
    const documents: Record<string, string> = {
      "Catalogo residenziale 2025":
        "catalog-data/sources/hvac/daikin-residential-2025.pdf",
      "Catalogo residenziale Gree 2026":
        "catalog-data/sources/splits/gree-residential-2026.pdf",
      "Residential product guide 2025 UK":
        "catalog-data/sources/splits/mitsubishi-uk-residential-2025.pdf",
      "Brochure MSZ-AY 2025 Italia":
        "catalog-data/sources/splits/mitsubishi-ay-2025.pdf",
      "LG Italia H18S1DA, pagina prodotto acquisita 2026-10-25":
        "catalog-data/sources/splits/lg-italy/h18s1da.html",
      "LG Italia H12S1PA, pagina prodotto acquisita 2026-10-25":
        "catalog-data/sources/splits/lg-italy/h12s1pa.html",
    };
    const unarchived = new Set<string>();
    for (const series of splitSeriesPresentations) {
      if (series.sourceMetadata.sourceType === "pdf")
        expect(series.sourceMetadata.page).toBeGreaterThan(0);
      else expect(series.sourceMetadata.page).toBeNull();
      const revision = series.sourceMetadata.documentRevision!;
      const archived = archivedDocument(
        series.sourceMetadata.sha256,
        documents[revision] ?? "",
      );
      if (archived)
        expect(hash(archived).toLowerCase()).toBe(
          series.sourceMetadata.sha256.toLowerCase(),
        );
      else unarchived.add(revision);
    }
    reportUnarchived([...unarchived]);
  });

  it("retains published table boundaries, capacities and exact mono pairing", () => {
    const unit = (model: string) =>
      splitCatalog.indoorUnits.find((u) => u.model === model)!;
    expect(unit("FTXP35N9")).toMatchObject({
      widthMm: 770,
      heightMm: 286,
      depthMm: 225,
    });
    expect(unit("FTXP50N9")).toMatchObject({
      widthMm: 990,
      heightMm: 295,
      depthMm: 263,
    });
    expect(unit("FTXA35CW").nominalCoolingW).toBe(3400);
    expect(unit("FTXF35E").nominalCoolingW).toBe(3300);
    expect(unit("MSZ-HR60VF")).toMatchObject({
      nominalCoolingW: 6100,
      widthMm: 923,
      heightMm: 305,
      depthMm: 263,
    });
    expect(unit("GWH12AUCXB-K6DNA1A/I")).toMatchObject({
      nominalCoolingW: 3510,
      nominalHeatingW: 3810,
    });
    expect(
      splitCatalog.combinations.find((combo) =>
        combo.indoorProductIds.includes(unit("FTXP50N9").id),
      )?.outdoorModel,
    ).toBe("RXP50N8");
    // Multi-only columns must not acquire fictional mono outdoor units.
    for (const model of ["MSZ-EF18VGKW", "MSZ-EF22VGKW", "MSZ-LN18VG2W"])
      expect(
        extra.combinations.some((c) =>
          c.indoorProductIds.includes(unit(model).id),
        ),
      ).toBe(false);
    expect(extra.combinations).toHaveLength(43);
    expect(
      extra.combinations.every(
        (c) => c.mode === "mono" && c.indoorProductIds.length === 1,
      ),
    ).toBe(true);
    expect(
      extra.indoorUnits
        .filter((u) => u.manufacturer === "Mitsubishi Electric")
        .every((u) => u.region.includes("UK")),
    ).toBe(true);
  });

  it("keeps filtration claims specific to AY revision and compares commercial tiers", () => {
    const vgkp = splitUnitPresentation({
      manufacturer: "Mitsubishi Electric",
      family: "MSZ-AY",
      model: "MSZ-AY25VGKP",
    })!;
    const vgk = splitUnitPresentation({
      manufacturer: "Mitsubishi Electric",
      family: "MSZ-AY",
      model: "MSZ-AY25VGK",
    })!;
    expect(vgkp.features).toContain("Plasma Quad Plus (VGKP)");
    expect(vgk.features).toContain("Filtro V-Blocking");
    expect(
      vgk.features.some((feature) => feature.includes("Plasma Quad Plus")),
    ).toBe(false);
    expect(vgk.sourceMetadata.page).toBe(52);
    expect(splitPresentation("MSZ-EF")!.gains.join(" ")).toContain(
      "non indica filtrazione superiore",
    );
    expect(splitPresentation("Clivia")!.gains.join(" ")).toContain(
      "già presenti anche sulla gamma Pular",
    );
    for (const series of splitSeriesPresentations.filter((s) => s.tier > 1))
      expect(series.gains.length, series.family).toBeGreaterThan(0);
  });

  it("keeps historical selections resolvable after extending the catalog", () => {
    const revisions = Object.keys(historical).filter(
      (version) => version !== splitCatalog.version,
    );
    expect(revisions.length).toBeGreaterThan(0);
    for (const version of revisions) {
      const old = splitCatalogAtVersion(version)!;
      expect(old).not.toBeNull();
      for (const combo of old.combinations) {
        const resolved = splitCombinationAtVersion(combo.id, version)!;
        expect(resolved.id).toBe(combo.id);
        expect(resolved.coolingCapacityW).toBe(combo.coolingCapacityW);
        expect(resolved.indoorProductIds).toEqual(combo.indoorProductIds);
      }
    }
  });
});
