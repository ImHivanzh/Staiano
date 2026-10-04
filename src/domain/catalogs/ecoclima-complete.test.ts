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
} from "./air-terminals";
import { airTerminalCatalogSchema } from "./air-terminal-schema";
import { sizeAirTerminal } from "../air-terminals/size";

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
