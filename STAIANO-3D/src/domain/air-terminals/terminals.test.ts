import { describe, it, expect } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { airTerminalCatalogSchema } from "@/domain/catalogs/air-terminal-schema";
import { acousticUpperBound, sizeAirTerminal } from "./size";
const family = airTerminalCatalog.families[0];
it("EADD published airflow ranges remain auditable but do not invent acoustic operating points", () => {
  const eadd = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EADD",
  )!;
  expect(
    eadd.variants.find((v) => v.id === "ecoclima-eadd-80")
      ?.publishedAirflowRangeM3h,
  ).toEqual([15, 60]);
  expect(
    eadd.variants.find((v) => v.id === "ecoclima-eadd-200")
      ?.publishedAirflowRangeM3h,
  ).toEqual([240, 350]);
  expect(eadd.variants.every((v) => v.operatingPoints.length === 0)).toBe(true);
  expect(sizeAirTerminal(40, 1, eadd, "supply")).toEqual([]);
});
describe("EVVMC celle ufficiali senza interpolazione", () => {
  it("normalizza sei diametri, conserva apertura negativa e rumore", () => {
    const f = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EVVMC",
    )!;
    expect(f.variants).toHaveLength(6);
    const p = f.variants
      .find((v) => v.nominalDiameterMm === 200)!
      .operatingPoints.find(
        (p) => p.airflowM3h === 300 && p.openingMm === -10,
      )!;
    expect(p.pressureDropPa).toBe(140);
    expect(p.noiseDbA).toBe(36);
  });
  it("esclude punto38dB(A) e richiede apertura cono nel log", () => {
    const f = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EVVMC",
    )!;
    const solutions = sizeAirTerminal(150, 1, f, "supply");
    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions.every((s) => s.operatingPoint.noiseDbA !== 38)).toBe(true);
    expect(solutions[0].log.some((l) => l.includes("Apertura cono S"))).toBe(
      true,
    );
  });
});
describe("EDLS e limite acustico su dati ufficiali", () => {
  it("preserva 6 varianti e 36 operating point della revisione corrente", () => {
    expect(family.variants).toHaveLength(6);
    expect(family.variants.flatMap((v) => v.operatingPoints)).toHaveLength(36);
  });
  it("EDLS1F20:175m³/h per metro,41Pa,4.5m,37dB(A)", () => {
    const p = family.variants[0].operatingPoints[3];
    expect(p.airflowPerMeterM3h).toBe(175);
    expect(p.pressureDropPa).toBe(41);
    expect(p.throwM).toBe(4.5);
    expect(p.noiseDbA).toBe(37);
  });
  it("lunghezza teorica distinta da commerciale e portata sufficiente", () => {
    const variant = family.variants[0];
    const solutions = sizeAirTerminal(
      480,
      2,
      { ...family, variants: [variant] },
      "supply",
    );
    const selected = solutions[0];
    expect(selected.theoreticalLengthM).toBeCloseTo(240 / 175);
    expect(selected.commercialLengthM).toBe(1.5);
    expect(selected.availableAirflowPerPointM3h).toBe(262.5);
    expect(acousticUpperBound(selected.operatingPoint)).toBe(37);
  });
  it("non seleziona punti oltre37 o rumore ignoto", () => {
    expect(
      sizeAirTerminal(200, 1, family, "supply").every(
        (s) => acousticUpperBound(s.operatingPoint)! <= 37,
      ),
    ).toBe(true);
    const variant = {
      ...family.variants[0],
      operatingPoints: family.variants[0].operatingPoints.filter(
        (p) => p.noiseDbA !== null && p.noiseDbA > 37,
      ),
    };
    expect(
      sizeAirTerminal(200, 1, { ...family, variants: [variant] }, "supply"),
    ).toEqual([]);
  });
  it("300 m³/h recommends a sufficient single length for each selected performance", () => {
    const variant = family.variants.find(
      (item) => item.slotCount === 1 && item.slotWidthMm === 30,
    )!;
    const solutions = sizeAirTerminal(
      300,
      1,
      { ...family, variants: [variant] },
      "supply",
    );
    const louder = solutions.find(
      (item) => item.operatingPoint.noiseDbA === 37,
    )!;
    const quieter = solutions.find(
      (item) => item.operatingPoint.noiseDbA === 32,
    )!;
    expect(louder.commercialLengthM).toBe(1.2);
    expect(quieter.commercialLengthM).toBe(1.5);
    for (const solution of [louder, quieter]) {
      expect(solution.quantityPerPoint).toBe(1);
      expect(solution.availableAirflowPerPointM3h).toBeGreaterThanOrEqual(300);
      const shorter = variant.commercialLengthsMm
        .filter((length) => length < solution.commercialLengthM! * 1000)
        .at(-1)!;
      expect(
        (shorter / 1000) * solution.operatingPoint.airflowPerMeterM3h!,
      ).toBeLessThan(300);
    }
  });
  it("prefers one sufficient terminal over several shorter modules", () => {
    const variant = {
      ...family.variants[0],
      commercialLengthsMm: [800, 2000],
      operatingPoints: [family.variants[0].operatingPoints[3]],
    };
    const [solution] = sizeAirTerminal(
      250,
      1,
      { ...family, variants: [variant] },
      "supply",
    );
    expect(solution.quantityPerPoint).toBe(1);
    expect(solution.commercialLengthM).toBe(2);
    expect(solution.availableAirflowPerPointM3h).toBe(350);
    const [multiple] = sizeAirTerminal(
      1000,
      1,
      { ...family, variants: [variant] },
      "supply",
    );
    expect(multiple.quantityPerPoint).toBeGreaterThan(1);
    expect(multiple.availableAirflowPerPointM3h).toBeGreaterThanOrEqual(1000);
  });
  it("<20 è limite superiore dichiarato, non valore esatto", () => {
    const point = family.variants[0].operatingPoints[0];
    expect(point.noiseDbA).toBeNull();
    expect(point.noiseUpperBoundDbA).toBe(20);
    expect(point.noiseLabel).toBe("<20");
  });
  it("non inventa prestazioni di ripresa", () => {
    expect(sizeAirTerminal(200, 1, family, "return")).toEqual([]);
  });
  it("valori revisione3 restano originali anche se anomalie apparenti", () => {
    expect(family.variants[5].operatingPoints[0].airflowPerMeterM3h).toBe(305);
  });
  it("terminali discreti selezionano unità, senza metri lineari", () => {
    const variant = {
      ...family.variants[0],
      commercialLengthsMm: [],
      operatingPoints: [
        {
          ...family.variants[0].operatingPoints[3],
          airflowM3h: 300,
          airflowPerMeterM3h: null,
        },
      ],
    };
    const result = sizeAirTerminal(
      900,
      1,
      {
        ...family,
        isLinearPerMeter: false,
        type: "grille",
        variants: [variant],
      },
      "supply",
    );
    expect(result[0].quantityPerPoint).toBe(3);
    expect(result[0].theoreticalLengthM).toBeNull();
    expect(result[0].availableAirflowPerPointM3h).toBe(900);
  });
  it("schema rifiuta portate negative e dati per-metro mancanti", () => {
    expect(() =>
      airTerminalCatalogSchema.parse({
        ...airTerminalCatalog,
        families: [
          {
            ...family,
            variants: [
              {
                ...family.variants[0],
                operatingPoints: [
                  { ...family.variants[0].operatingPoints[0], airflowM3h: -1 },
                ],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("EBLF usa varianti discrete e intervallo acustico conservativo", () => {
    const f = airTerminalCatalog.families.find((f) => f.familyCode === "EBLF")!;
    expect(f.isLinearPerMeter).toBe(false);
    expect(f.variants).toHaveLength(42);
    const result = sizeAirTerminal(300, 1, f, "supply");
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every(
        (r) =>
          r.operatingPoint.quality === "valid" &&
          acousticUpperBound(r.operatingPoint)! <= 37,
      ),
    ).toBe(true);
  });
  it("EGQ ripresa, punti incoerenti esclusi senza correggere dati", () => {
    const f = airTerminalCatalog.families.find((f) => f.familyCode === "EGQ")!;
    expect(f.variants).toHaveLength(72);
    expect(sizeAirTerminal(600, 1, f, "return").length).toBeGreaterThan(0);
    expect(sizeAirTerminal(600, 1, f, "supply")).toEqual([]);
    const bad = f.variants.find((v) => v.id === "ecoclima-egq-1200x300")!;
    expect(bad.effectiveAreaM2).toBe(0.554);
    expect(
      sizeAirTerminal(200, 1, { ...f, variants: [bad] }, "return"),
    ).toEqual([]);
  });
});
