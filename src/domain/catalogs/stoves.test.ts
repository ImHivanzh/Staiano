import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { stoveBrands, stoveCatalog } from "./stoves";

describe("catalogo stufe ufficiale", () => {
  it("conserva foto locali e provenienza verificata per ogni modello", () => {
    expect(new Set(stoveCatalog.products.map((item) => item.id)).size).toBe(
      stoveCatalog.products.length,
    );
    for (const item of stoveCatalog.products) {
      expect(stoveBrands).toContain(item.brand);
      expect(item.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(new URL(item.sourceUrl).hostname).toMatch(
        /^(ita\.ravelligroup\.it|www\.lanordica-extraflame\.com)$/,
      );
      expect(existsSync(`public${item.photo}`)).toBe(true);
      expect(item.colors.some((color) => color.includes("optional"))).toBe(
        false,
      );
    }
  });
  it("comprende pellet, legna e termostufe di entrambi i marchi", () => {
    for (const brand of stoveBrands) {
      for (const fuel of ["Pellet", "Legna"]) {
        expect(
          stoveCatalog.products.some(
            (item) => item.brand === brand && item.fuel === fuel,
          ),
        ).toBe(true);
      }
      expect(
        stoveCatalog.products.some(
          (item) => item.brand === brand && item.technology === "Idro",
        ),
      ).toBe(true);
    }
    expect(
      stoveCatalog.products.find((item) => item.id === "ravelli-flexi-7")
        ?.colors,
    ).toEqual(["Bianco", "Nero"]);
    expect(
      stoveCatalog.products.find(
        (item) => item.id === "nordica-termorossella-plus-dsa16-cera",
      )?.technology,
    ).toBe("Idro");
  });
});
