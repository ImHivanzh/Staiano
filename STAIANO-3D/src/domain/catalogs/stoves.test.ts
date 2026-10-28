import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { stoveBrands, stoveCatalog, stoveTechnicalCatalog } from "./stoves";

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
  it("mostra ingombri e potenze ufficiali solo per i modelli verificati", () => {
    expect(stoveCatalog.products).toHaveLength(170);
    expect(stoveTechnicalCatalog.products).toHaveLength(170);
    const flexi = stoveCatalog.products.find((item) => item.id === "ravelli-flexi-7")!;
    expect(flexi.technical).toMatchObject({
      dimensionsMm: { widthMm: 530, heightMm: 1050, depthMm: 570 },
      nominalPowerW: { minW: 3300, maxW: 7100 },
      weightKg: 193,
    });
    const isetta = stoveCatalog.products.find((item) => item.id === "nordica-isetta-cc165")!;
    expect(isetta.technical).toMatchObject({
      dimensionsMm: { widthMm: 661, heightMm: 898, depthMm: 594 },
      nominalPowerW: { minW: 8200, maxW: 8200 },
      partLoadPowerW: 4900,
      waterPowerW: null,
      flueDiameterMm: 150,
      articleCode: "3010340",
      imageAssetSku: "3008340",
      sourceMetadata: { sourceType: "pdf", page: 4, sha256: "3573cab62c84a9721632acb92aea186f40b72bfd81c24823907ef0814cc815aa" },
    });
    expect(isetta.technical!.supportingSources.map((source) => source.sourceMetadata.sourceType)).toEqual(["json", "pdf", "html"]);
    expect(isetta.technical!.supportingSources.find((source) => source.sourceMetadata.sourceType === "json")?.sourceMetadata.sha256).toBe("c92a07b30ba72aaa44430a46cf8de2fab8684bfdfa638f7c22f06f7ab2bf43ea");
  });
  it.each(["ravelli-easy-7", "ravelli-easy-9"])("uses the PDF millimetres for %s despite the HTML cm label", (id) => {
    const product = stoveCatalog.products.find((item) => item.id === id)!;
    expect(product.technical?.dimensionsMm).toEqual({ widthMm: 525, heightMm: 1030, depthMm: 480 });
    expect(product.technical?.supportingSources).toEqual([
      { sourceMetadata: expect.objectContaining({ sourceType: "pdf", page: 1, manufacturer: "Ravelli" }) },
    ]);
  });
});
