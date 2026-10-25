import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import inventory from "../../../catalog-data/generated/ecoclima.inventory.json";
import previous from "../../../catalog-data/generated/ecoclima.previous.json";
import discovery from "../../../catalog-data/sources/ecoclima/complete-discovery.json";
import {
  airTerminalCatalog,
  airTerminalCatalogAtVersion,
  airTerminalMountings,
} from "./air-terminals";
import { airTerminalCatalogSchema } from "./air-terminal-schema";
import { sizeAirTerminal } from "../air-terminals/size";
import { applyAirTerminalSolution } from "../air-terminals/apply";
import { addRectangle, createProject } from "../project";

describe("complete official Ecoclima snapshot", () => {
  it("accounts for every official category entry, with explicit partial coverage", () => {
    expect(inventory.totals.officialPages).toBe(discovery.records.length);
    expect(inventory.entries).toHaveLength(109);
    expect(inventory.totals.pendingNormalizationPages).toBe(0);
    expect(
      inventory.entries.filter(
        (entry) => entry.status === "outside-terminal-scope",
      ),
    ).toHaveLength(12);
    expect(
      inventory.entries.some((entry) => entry.status === "performance-pending"),
    ).toBe(true);
    expect(inventory.catalogVersion).toBe(airTerminalCatalog.version);
    expect(inventory.totals.normalizedFamilies).toBe(
      airTerminalCatalog.families.length,
    );
  });

  it("preserves all previous variant identities, values and exact version lookup", () => {
    const historical = airTerminalCatalogSchema.parse(previous);
    expect(airTerminalCatalogAtVersion(historical.version)).toEqual(historical);
    const legacyCodes = new Set([
      "EDLS",
      "EBLF",
      "EGQ",
      "ETA",
      "EVVMC",
      "EGS",
      "EADD",
    ]);
    for (const family of historical.families.filter((family) =>
      legacyCodes.has(family.familyCode),
    )) {
      const current = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === family.familyCode,
      )!;
      for (const variant of family.variants)
        expect(
          current.variants.find((candidate) => candidate.id === variant.id),
        ).toEqual(variant);
    }
  });

  it("keeps official source bytes and local product photographs available offline", () => {
    const sourceRoot = path.join(
      process.cwd(),
      "catalog-data/sources/ecoclima",
    );
    for (const record of discovery.records) {
      for (const source of [record.htmlSource, ...record.documents]) {
        expect(
          createHash("sha256")
            .update(readFileSync(path.join(sourceRoot, source.filename)))
            .digest("hex"),
        ).toBe(source.sha256);
      }
      for (const photo of record.images)
        expect(
          createHash("sha256")
            .update(
              readFileSync(path.join(process.cwd(), "public", photo.path)),
            )
            .digest("hex"),
        ).toBe(photo.sha256);
    }
    for (const family of airTerminalCatalog.families) {
      expect(family.image).toMatch(/^\/catalog\//);
      expect(
        existsSync(path.join(process.cwd(), "public", family.image!)),
      ).toBe(true);
    }
  });

  it("preserves EDSC acoustic columns, direction and damper setting", () => {
    const family = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EDSC-C",
    )!;
    const variant = family.variants.find(
      (candidate) => candidate.nominalDiameterMm === 100,
    )!;
    const supply = variant.operatingPoints.find(
      (point) =>
        point.use === "supply" &&
        point.settingCode === "D0" &&
        point.noiseDbA === 20,
    )!;
    const returning = variant.operatingPoints.find(
      (point) =>
        point.use === "return" &&
        point.settingCode === "D0" &&
        point.noiseDbA === 20,
    )!;
    expect(supply.airflowM3h).toBe(72);
    expect(supply.pressureDropPa).toBe(15);
    expect(returning.pressureDropPa).toBe(13);
    expect(
      sizeAirTerminal(70, 1, family, "return").every(
        (solution) => solution.operatingPoint.use === "return",
      ),
    ).toBe(true);
  });

  it("does not turn EDLSV discrete length data into per-meter performance", () => {
    const family = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EDLSV",
    )!;
    expect(family.isLinearPerMeter).toBe(false);
    const variant = family.variants.find(
      (candidate) => candidate.lengthMm === 500,
    )!;
    expect(variant.operatingPoints[0].airflowM3h).toBe(52);
    expect(variant.operatingPoints[0].airflowPerMeterM3h).toBeNull();
    expect(variant.operatingPoints[0].noiseDbA).toBeNull();
    expect(variant.operatingPoints[0].noiseUpperBoundDbA).toBe(20);
  });

  it("distinguishes EGA frame dimensions and requested push closure from a nonexistent model", () => {
    const family = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EGA",
    )!;
    const variant = family.variants.find(
      (candidate) => candidate.id === "ecoclima-ega-560x560",
    )!;
    expect(variant.widthMm).toBe(560);
    expect(variant.faceWidthMm).toBe(595);
    expect(variant.faceHeightMm).toBe(595);
    expect(variant.dimensionNote).toContain("pagina 2");
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sha256:
        "99107a22b0a03bac53b8bc4573eee8a11500336b9ab81b973afce052a50cde88",
      page: 2,
    });
    const ega6 = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EGA6",
    )!;
    expect(ega6.closureOptions?.some((closure) => /push/i.test(closure))).toBe(
      true,
    );
    const square = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EDSC-Q",
    )!;
    const anomalous = square.variants
      .find((candidate) => candidate.nominalDiameterMm === 100)!
      .operatingPoints.find(
        (point) =>
          point.use === "return" &&
          point.settingCode === "D4" &&
          point.noiseDbA === 30,
      )!;
    expect(anomalous.airflowM3h).toBe(175);
    expect(anomalous.quality).toBe("review");
    expect(
      airTerminalCatalog.families.some(
        (candidate) => candidate.familyCode === "EGA-PUSH",
      ),
    ).toBe(false);
  });

  it("uses the published EGA50 external frame dimensions without guessing depth", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EGA50-3F",
      )!,
      variant = family.variants.find(
        (candidate) => candidate.id === "ecoclima-ega50-3f-400x400",
      )!,
      drawing = family.supportingSources?.[0].sourceMetadata;
    expect(family.modelCodes).toEqual(["EGA50-3F", "EGA50-4F"]);
    expect(variant.widthMm).toBe(400);
    expect(variant.heightMm).toBe(400);
    expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([460, 460]);
    expect(variant.originalDimensionsMm).toMatchObject({
      externalFrameL: 460,
      externalFrameH: 460,
    });
    expect(variant.bodyDepthMm).toBeNull();
    expect(drawing).toMatchObject({
      sourceType: "pdf",
      page: 2,
      sha256:
        "a0cf28881ef67e23e097c2bfafc0fd16b1da64b0a96880c51e3cf0a27610ab69",
    });
    expect(family.variants).toHaveLength(56);
    for (const item of family.variants) {
      expect(item.faceWidthMm).toBe(item.widthMm! + 60);
      expect(item.faceHeightMm).toBe(item.heightMm! + 60);
    }
  });

  it("uses EGA50 published outer-frame and wall-opening dimensions", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EGA50",
      )!,
      entry = inventory.entries.find((item) => item.code === "EGA50")!;
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      page: 2,
      sha256:
        "c8e8d018b03bae40c60b2ee417f80b940a69391af0514d72cc218bb50555ed5e",
    });
    expect(family.variants).toHaveLength(56);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm! + 60,
        variant.heightMm! + 60,
      ]);
      expect(variant.originalDimensionsMm).toMatchObject({
        installationWidth: variant.widthMm! - 20,
        installationHeight: variant.heightMm! - 20,
      });
      expect(variant.dimensionNote).toContain("pagina 2");
    }
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("uses the EGA50-3S front drawing without assuming a shared depth", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EGA50-3S",
      )!,
      entry = inventory.entries.find((item) => item.code === "EGA50-3S")!;
    expect(family.modelCodes).toEqual(["EGA50-3SA", "EGA50-3SE"]);
    expect(family.sourceMetadata).toMatchObject({
      sourceType: "html",
      sha256:
        "1b86a0131e4ca270ea0c4cccd29b8b82b92359a92867c2796714794a68544420",
    });
    expect(family.variants).toHaveLength(56);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm! + 60,
        variant.heightMm! + 60,
      ]);
      expect(variant.bodyDepthMm).toBeNull();
      expect(variant.dimensionNote).toContain("L+60×H+60");
    }
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("uses EVVAIR panel faces without substituting the connection or inventing body depth", () => {
    const circular = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EVVAIR-C",
      )!,
      square = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EVVAIR-Q",
      )!,
      entry = inventory.entries.find((item) => item.code === "EVVAIR")!;
    expect(circular).toMatchObject({
      shape: "circle",
      mountings: ["wall", "ceiling"],
    });
    expect(square).toMatchObject({
      shape: "rectangle",
      mountings: ["wall", "ceiling"],
    });
    expect(circular.variants[0]).toMatchObject({
      nominalDiameterMm: 125,
      connectionDiameterMm: 125,
      widthMm: null,
      heightMm: null,
      faceWidthMm: 228,
      faceHeightMm: 228,
      bodyDepthMm: null,
    });
    expect(square.variants[0]).toMatchObject({
      nominalDiameterMm: 125,
      connectionDiameterMm: 125,
      widthMm: null,
      heightMm: null,
      faceWidthMm: 230,
      faceHeightMm: 230,
      bodyDepthMm: null,
    });
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
    expect(entry.status).toBe("performance-pending");
    expect(sizeAirTerminal(20, 1, circular, "supply")).toEqual([]);
    for (const [family, widthMm, shape] of [
      [circular, 228, "circle"],
      [square, 230, "rectangle"],
    ] as const) {
      let project = createProject();
      project = addRectangle(project, project.floors[0].id, {
        width: 5,
        length: 4,
        height: 2.7,
        name: "Soggiorno",
      });
      const solution = sizeAirTerminal(20, 1, family, "return")[0]!;
      project = applyAirTerminalSolution(
        project,
        project.rooms[0].id,
        null,
        "return",
        family.familyCode,
        solution,
        "ceiling",
      );
      expect(project.airTerminals[0]).toMatchObject({
        widthMm,
        heightMm: widthMm,
        depthMm: null,
        shape,
      });
    }
  });

  it("uses each EGZ series drawing for its frame and masonry opening", () => {
    for (const [code, productId, sha256] of [
      [
        "EGZ50",
        "ecoclima-egz50-400x400",
        "45b6aa4dbccfc9769a5b3bf76c81646cb401b7c8d5f7e681fd3061ae46be9f15",
      ],
      [
        "EGZ100",
        "ecoclima-egz100-600x600",
        "043d30f7bfb505cf4fe343b5e14f5b079f72a783ed5cc18dde7fd1a16c3c86f4",
      ],
    ] as const) {
      const family = airTerminalCatalog.families.find(
          (candidate) => candidate.familyCode === code,
        )!,
        entry = inventory.entries.find((item) => item.code === code)!,
        variant = family.variants.find((item) => item.id === productId)!;
      expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
        sourceType: "pdf",
        page: 2,
        sha256,
      });
      expect(family.variants).toHaveLength(56);
      for (const item of family.variants) {
        expect([item.faceWidthMm, item.faceHeightMm]).toEqual([
          item.widthMm! + 60,
          item.heightMm! + 60,
        ]);
        expect(item.originalDimensionsMm).toMatchObject({
          installationWidth: item.widthMm! - 20,
          installationHeight: item.heightMm! - 20,
        });
      }
      expect(variant.dimensionNote).toContain("pagina 2");
      expect(entry.missingFrontGeometryVariantIds).toEqual([]);
    }
  });

  it("retains current EDE1 areas and flags the conflicting 2021 PDF", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EDE1",
      )!,
      areas = [0.0081, 0.0164, 0.0354, 0.0506, 0.0506, 0.0787];
    expect(family.operatingConditions).toContain(
      "PDF 01/2021 riporta sezioni efficaci circa il 20%",
    );
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      sha256:
        "ecde224abcbbf1e5764abbe0978095dc11c564213f80ef6859f071e93758bdc4",
    });
    for (const [index, area] of areas.entries()) {
      const variant = family.variants.find(
        (candidate) =>
          candidate.id ===
          `ecoclima-ede1-${[300, 400, 500, 600, 625, 800][index]}`,
      )!;
      expect(variant.effectiveAreaM2).toBe(area);
      for (const point of variant.operatingPoints) {
        const areaFromFlow = point.airflowM3h / (3600 * point.velocityMs!);
        expect(Math.abs(area - areaFromFlow) / area).toBeLessThan(0.03);
      }
    }
  });

  it("separates EDE1/EDE2 insert sizes from their published 600-panel faces", () => {
    for (const familyCode of ["EDE1", "EDE2"]) {
      const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === familyCode,
      )!;
      expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
        sourceType: "pdf",
        sha256:
          familyCode === "EDE1"
            ? "ecde224abcbbf1e5764abbe0978095dc11c564213f80ef6859f071e93758bdc4"
            : "f5631aba5cb141faa48d5f00232c9adf75de5576c13b09531c5f341e6a68d81d",
      });
      for (const nominal of [300, 400, 500]) {
        const variant = family.variants.find(
          (candidate) =>
            candidate.id ===
            `ecoclima-${familyCode.toLowerCase()}-${nominal}-600`,
        )!;
        expect([variant.widthMm, variant.heightMm]).toEqual([
          nominal - 5,
          nominal - 5,
        ]);
        expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([595, 595]);
        expect(variant.originalDimensionsMm).toMatchObject({
          nominalDiffuserMm: nominal,
          nominalPanelMm: 600,
          panelAMm: 595,
          panelBMm: 595,
        });
        expect(variant.dimensionNote).toContain("pagina 2");
        expect(variant.operatingPoints).toHaveLength(0);
      }
    }
  });

  it("keeps EBL front size conditional on its selected frame code", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EBL",
      )!,
      entry = inventory.entries.find((item) => item.code === "EBL")!;
    expect(family.modelCodeFaceOffsetsMm).toMatchObject({
      "EBL-20/0°": { widthMm: 35, heightMm: 35 },
      "EBL-21/15°": { widthMm: 35, heightMm: 35 },
      "EBL-22/0°": { widthMm: -1, heightMm: -1 },
      "EBL-22/15°": { widthMm: -1, heightMm: -1 },
    });
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      sha256:
        "5aa95558b04cc846c696e614882064a16ad0b206847df952833f5174472b78c1",
    });
    expect(entry.missingFrontGeometryVariantIds).toHaveLength(0);
    expect(entry.modelCodeDependentFrontGeometryVariantIds).toHaveLength(31);
  });

  it("uses the published EBLR outer frame dimensions for every size", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EBLR",
      )!,
      entry = inventory.entries.find((item) => item.code === "EBLR")!;
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      sha256:
        "f0bf526a43dbc149be6f6a9d90fd4a05619ec9bec44edea9fda31df8dbb0b4a6",
    });
    expect(family.variants).toHaveLength(15);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm! + 15,
        variant.heightMm! + 15,
      ]);
      expect(variant.dimensionNote).toContain("EBLR 2025, pagina 2");
    }
    expect(entry.status).toBe("verified-published-tables");
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("uses EBLS 2026 framed front dimensions for every size", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EBLS",
      )!,
      entry = inventory.entries.find((item) => item.code === "EBLS")!;
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      sha256:
        "901589d35c04c42902d55de9415fbb75ebbf36c42a5b76a0c3ac2683058eaa0b",
    });
    expect(family.variants).toHaveLength(25);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm! + 35,
        variant.heightMm! + 35,
      ]);
      expect(variant.dimensionNote).toContain("EBLS 2026, pagine 6–7");
    }
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("uses EGQR drawing dimensions for the face and installation opening", () => {
    const family = airTerminalCatalog.families.find(
        (candidate) => candidate.familyCode === "EGQR",
      )!,
      entry = inventory.entries.find((item) => item.code === "EGQR")!;
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sourceType: "pdf",
      sha256:
        "3b8e4dc8beafb090918d22edddb2a98e92c6f5c1eb43c31018931a28e72b0dfe",
      page: 2,
    });
    expect(family.variants).toHaveLength(36);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm! + 15,
        variant.heightMm! + 15,
      ]);
      expect(variant.bodyDepthMm).toBe(22);
      expect(variant.originalDimensionsMm).toMatchObject({
        installationWidth: variant.widthMm! - 5,
        installationHeight: variant.heightMm! - 5,
        profileDepth: 22,
      });
      expect(variant.dimensionNote).toContain("pagina 2");
    }
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("models the EDFL commercial length as a separate outer-face length", () => {
    const families = airTerminalCatalog.families.filter((family) =>
        /^EDFLB?-\d+$/.test(family.familyCode),
      ),
      entry = inventory.entries.find((item) => item.code === "EDFL")!;
    expect(
      families.reduce((sum, family) => sum + family.variants.length, 0),
    ).toBe(48);
    for (const family of families) {
      expect(family.isLinearPerMeter).toBe(true);
      expect(family.linearFaceLengthOffsetMm).toBe(50);
      expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
        sha256:
          "273a781cdc0ba9cb6bbebc0a3688b60ac02a75c9b954c34b3efc84609a492afe",
        page: 2,
      });
    }
    expect(entry.status).toBe("verified-published-tables");
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("documents EGQIF wall mounting, substrate kit, and front size", () => {
    const family = airTerminalCatalog.families.find(
        (item) => item.familyCode === "EGQIF",
      )!,
      entry = inventory.entries.find((item) => item.code === "EGQIF")!;
    expect(airTerminalMountings(family)).toEqual(["wall"]);
    expect(family.mountingType).toContain("cartongesso");
    expect(family.geometryNote).toContain("kit piastra");
    expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
      sha256:
        "bc9d957a6b1388eaf7ef7789fbf70c426003dd47bb081d34502003f81b0bb778",
      page: 3,
    });
    expect(family.variants).toHaveLength(42);
    for (const variant of family.variants) {
      expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([
        variant.widthMm,
        variant.heightMm,
      ]);
      expect(variant.dimensionNote).toContain("pagina 3");
    }
    expect(entry.missingFrontGeometryVariantIds).toEqual([]);
  });

  it("keeps unknown noise and thermal configuration points out of automatic sizing", () => {
    const unknown = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EVVAIR-C",
    )!;
    expect(unknown.variants[0].operatingPoints.length).toBeGreaterThan(0);
    expect(sizeAirTerminal(50, 1, unknown, "supply")).toEqual([]);
    const thermal = airTerminalCatalog.families.find(
      (candidate) => candidate.familyCode === "EDRC",
    )!;
    expect(thermal.variants[0].operatingPoints.length).toBeGreaterThan(0);
    expect(
      thermal.variants[0].operatingPoints.every(
        (point) =>
          point.quality === "review" && point.settingCode?.includes("Δt"),
      ),
    ).toBe(true);
    expect(sizeAirTerminal(400, 1, thermal, "supply")).toEqual([]);
  });
});
