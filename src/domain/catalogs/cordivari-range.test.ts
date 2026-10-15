import { describe, expect, it } from "vitest";
import catalog from "../../../catalog-data/generated/cordivari-range.json";
import { radiatorCatalogSchema } from "./radiator-schema";
import { radiatorProductAtVersion } from "./radiators";
import {
  getRadiatorFinishOptions,
  resolveRadiatorFinish,
} from "./radiator-finishes";

describe("Cordivari 2025 verified hydronic range", () => {
  it("preserves published heights, horizontal/central interaxis and thermal output", () => {
    const parsed = radiatorCatalogSchema.parse(catalog);
    expect(parsed.products).toHaveLength(473);
    const side = parsed.products.find((p) => p.code === "3551686100001")!;
    const central = parsed.products.find((p) => p.code === "3551686100017")!;
    expect([
      side.heightMm,
      side.pitchMm,
      side.interaxisMm,
      side.elementOutputW,
      side.elementOutput30W,
      side.exponentN,
    ]).toEqual([840, 400, 350, 325, 175, 1.2074]);
    expect(central.interaxisMm).toBe(50);
    expect(central.elementOutputW).toBe(side.elementOutputW);
    for (const p of parsed.products) {
      expect(radiatorProductAtVersion(p.id, parsed.version)).toEqual(p);
      expect(resolveRadiatorFinish(p.manufacturer, p.family, "body")?.id).toBe(
        "cordivari-r01",
      );
      const colors = getRadiatorFinishOptions(p.manufacturer, p.family, "body");
      expect(colors.length).toBeGreaterThan(50);
      expect(colors.some((color) => color.id === "cordivari-f28")).toBe(false);
      expect(p.geometryAccuracy).toBe("schematic");
      expect(p.sourceMetadata.sourceUrl).toContain("cordivari.it/");
    }
  });
});
