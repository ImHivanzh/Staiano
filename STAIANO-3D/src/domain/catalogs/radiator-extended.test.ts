import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  radiatorCatalogs,
  radiatorProducts,
  radiatorProductAtVersion,
  radiatorProductPhoto,
} from "./radiators";
import { radiatorCatalogSchema } from "./radiator-schema";
import {
  elementOutputAtDeltaT,
  radiatorWidth,
  sizeRadiators,
} from "../radiators/size";

const product = (id: string) => radiatorProducts.find((p) => p.id === id)!;

describe("cataloghi radiatori aggiuntivi su schede originali", () => {
  it("mantiene cataloghi storici e integra 753 varianti documentate", () => {
    expect(radiatorCatalogs.map((c) => c.products.length)).toEqual([
      135, 19, 61, 473, 629, 63,
    ]);
    for (const name of ["cordivari", "global"]) {
      const legacy = radiatorCatalogSchema.parse(
        JSON.parse(readFileSync(`catalog-data/generated/${name}.json`, "utf8")),
      );
      expect(
        radiatorCatalogs.find((c) => c.version === legacy.version),
      ).toEqual(legacy);
      for (const p of legacy.products)
        expect(radiatorProductAtVersion(p.id, legacy.version)).toEqual(p);
    }
  });

  it("Lisa 22 700×750 è prodotto completo: interasse orizzontale 700, resa427W", () => {
    const p = product("cordivari-lisa22-3551646101133");
    expect(p.construction).toBe("fixed");
    expect(p.commercialElementCounts).toEqual([1]);
    expect(p.interaxisMm).toBe(700);
    expect(radiatorWidth(p, 1)).toBe(750);
    expect(p.elementOutputW).toBe(427);
    expect(p.exponentN).toBe(1.22623);
    const constraints = {
      numberOfRadiators: 1,
      manufacturer: "Cordivari",
      family: "Lisa 22",
    };
    expect(sizeRadiators(400, [p], 50, constraints)[0].totalPowerW).toBe(427);
    expect(sizeRadiators(500, [p], 50, constraints)).toEqual([]);
  });

  it("Charleston 2060 usa altezza esatta592, interasse534 e n pubblicato1.25", () => {
    const p = product("zehnder-charleston-2060");
    expect([p.heightMm, p.interaxisMm, p.depthMm, p.exponentN]).toEqual([
      592, 534, 62, 1.25,
    ]);
    expect(p.elementOutputW).toBe(45.3);
    expect(radiatorWidth(p, 10)).toBe(481);
    expect(elementOutputAtDeltaT(p, 30)).toBeCloseTo(45.3 * 0.6 ** 1.25);
    expect(p.commercialElementCounts[0]).toBe(3);
    expect(
      product("zehnder-charleston-6300").commercialElementCounts.at(-1),
    ).toBe(14);
  });

  it("Nova Easy distingue prodotto completo, alettatura, profondità e resa", () => {
    const single = product("zehnder-nova-znv-180-005-3570-9016");
    const double = product("zehnder-nova-znvlv-200-007-3570-9016");
    expect([single.elementOutputW, single.pitchMm, single.depthMm]).toEqual([
      625, 361, 47,
    ]);
    expect([
      double.elementOutputW,
      double.elementOutput30W,
      double.depthMm,
      double.exponentN,
    ]).toEqual([1932, 969, 110, 1.35]);
    expect(double.commercialElementCounts).toEqual([1]);
  });

  it("Sanremo mantiene rese specifiche bianco/cromato, senza moltiplicare tubi", () => {
    const white = product("lazzarini-sanremo-386483"),
      chrome = product("lazzarini-sanremo-386500");
    expect([
      white.heightMm,
      white.pitchMm,
      white.elementOutputW,
      white.exponentN,
    ]).toEqual([1703, 500, 802, 1.24973]);
    expect(chrome.elementOutputW).toBe(544);
    expect(chrome.commercialElementCounts).toEqual([1]);
    expect(chrome.geometryAccuracy).toBe("schematic");
  });

  it("ogni nuova variante risolve nello snapshot; foto locali con hash verificato", () => {
    for (const c of radiatorCatalogs.slice(2))
      for (const p of c.products) {
        expect(radiatorProductAtVersion(p.id, c.version)).toEqual(p);
        expect(p.exponentMethod).toBe("manufacturer");
        const photo = p.productPhoto!;
        const digest = createHash("sha256")
          .update(readFileSync(`public${photo.localPath}`))
          .digest("hex");
        expect(digest).toBe(photo.sha256);
      }
  });

  it("foto ufficiali anche per famiglie storiche senza mutare gli snapshot", () => {
    for (const p of radiatorProducts.slice(0, 154)) {
      expect(p.productPhoto).toBeUndefined();
      const photo = radiatorProductPhoto(p)!;
      expect(photo).not.toBeNull();
      expect(
        createHash("sha256")
          .update(readFileSync(`public${photo.localPath}`))
          .digest("hex"),
      ).toBe(photo.sha256);
    }
  });
});
