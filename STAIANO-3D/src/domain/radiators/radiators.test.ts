import { describe, it, expect } from "vitest";
import {
  radiatorProducts,
  radiatorCatalogs,
} from "@/domain/catalogs/radiators";
import { radiatorCatalogSchema } from "@/domain/catalogs/radiator-schema";
import { elementOutputAtDeltaT, radiatorWidth, sizeRadiators } from "./size";
import { applyRadiatorSolution } from "./apply";
import { addRectangle, createProject } from "@/domain/project";
const vip = () => radiatorProducts.find((p) => p.id === "global-vip-600")!;
describe("regressione radiatori su fonti ufficiali", () => {
  it("l’altezza fisica include i100mm della quota iniziale di posa", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 5,
      length: 5,
      height: vip().heightMm / 1000,
      name: "Quota limite",
    });
    const solution = sizeRadiators(p.rooms[0].designLoadW, [vip()], 50, {
      manufacturer: "Global",
      family: "VIP",
      numberOfRadiators: 1,
    })[0];
    expect(solution).toBeDefined();
    expect(() =>
      applyRadiatorSolution(p, p.rooms[0].id, solution, null),
    ).toThrow();
  });
  it("VIP/Oscar/Tondo: limiti pubblicati16bar e110°C", () => {
    const products = radiatorProducts.filter(
      (p) => p.manufacturer === "Global",
    );
    expect(products).toHaveLength(19);
    expect(
      products.every(
        (p) => p.maxPressureBar === 16 && p.maxTemperatureC === 110,
      ),
    ).toBe(true);
  });
  it("importa tutte le altezze Ardesia 2–6, VIP e Oscar", () => {
    expect(radiatorCatalogs[0].products).toHaveLength(135);
    expect(radiatorProducts.filter((p) => p.family === "VIP")).toHaveLength(5);
    expect(radiatorProducts.filter((p) => p.family === "OSCAR")).toHaveLength(
      7,
    );
  });
  it("Ardesia 4 H600: 84,7 W, n1,312, profondità148 e tappi24", () => {
    const p = radiatorProducts.find((p) => p.id === "cordivari-ardesia-4-600")!;
    expect(p.elementOutputW).toBe(84.7);
    expect(p.exponentN).toBe(1.312);
    expect(p.depthMm).toBe(148);
    expect(radiatorWidth(p, 10)).toBe(484);
    expect(elementOutputAtDeltaT(p, 30)).toBeCloseTo(84.7 * 0.6 ** 1.312);
  });
  it("VIP600: dati nominali e Km pubblicato, non interpolazione", () => {
    const p = vip();
    expect(p.elementOutputW).toBe(142);
    expect(p.heightMm).toBe(690);
    expect(p.weightKg).toBe(1.66);
    expect(p.waterContentL).toBe(0.49);
    expect(elementOutputAtDeltaT(p, 60)).toBeCloseTo(0.80797 * 60 ** 1.32201);
    expect(Math.round(elementOutputAtDeltaT(p, 60))).toBe(181);
  });
  it("Oscar900 modulare verticale: 946mm,175W, esponente1,34630", () => {
    const p = radiatorProducts.find((p) => p.id === "global-oscar-900")!;
    expect(p.heightMm).toBe(946);
    expect(p.elementOutputW).toBe(175);
    expect(p.exponentN).toBe(1.3463);
    expect(p.coefficientKm).toBe(0.9016);
  });
  it("minimo numero elementi senza deficit", () => {
    const result = sizeRadiators(1508, [vip()], 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 1,
    });
    expect(result[0].elements).toEqual([11]);
    expect(result[0].totalPowerW).toBe(1562);
  });
  it("rispetta larghezza e vincoli altezza/profondità", () => {
    expect(
      sizeRadiators(1508, [vip()], 50, {
        family: "VIP",
        manufacturer: "Global",
        numberOfRadiators: 1,
        maxWidthMm: 800,
      }),
    ).toHaveLength(0);
    expect(
      sizeRadiators(1508, [vip()], 50, {
        family: "VIP",
        manufacturer: "Global",
        numberOfRadiators: 1,
        maxHeightMm: 600,
      }),
    ).toHaveLength(0);
  });
  it("due radiatori sbilanciati di un elemento minimizzano eccesso", () => {
    const result = sizeRadiators(2400, [vip()], 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 2,
      maxWidthMm: 800,
    });
    expect(result[0].elements).toEqual([8, 9]);
    expect(result[0].totalPowerW).toBe(2414);
    expect(result[0].widthsMm).toEqual([640, 720]);
  });
  it("tre radiatori e conteggi commerciali", () => {
    const result = sizeRadiators(3500, [vip()], 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 3,
      maxWidthMm: 720,
    });
    expect(result[0].elements).toEqual([8, 8, 9]);
    expect(result[0].totalPowerW).toBe(3550);
  });
  it("VIP misti migliorano le batterie omogenee senza cambiare famiglia", () => {
    const constraints = {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 2,
      maxWidthMm: 800,
      maxHeightMm: 700,
    };
    const mixed = sizeRadiators(2400, radiatorProducts, 50, constraints)[0];
    const homogeneous = radiatorProducts
      .filter((p) => p.family === "VIP")
      .flatMap((p) => sizeRadiators(2400, [p], 50, constraints));
    expect(mixed.totalPowerW).toBe(2404);
    expect(mixed.totalPowerW).toBeLessThan(
      Math.min(...homogeneous.map((s) => s.totalPowerW)),
    );
    expect(mixed.units.map((u) => [u.variant.id, u.elements])).toEqual([
      ["global-vip-500", 8],
      ["global-vip-600", 10],
    ]);
    expect(
      mixed.units.every(
        (u) =>
          u.variant.family === "VIP" &&
          u.widthMm <= 800 &&
          u.variant.heightMm <= 700,
      ),
    ).toBe(true);
    expect(mixed.searchComplete).toBe(true);
  });
  it("vincoli liberi consentono batterie di due marche e mantengono entrambe le fonti", () => {
    const catalog = radiatorProducts
      .filter((p) =>
        ["cordivari-ardesia-4-600", "global-vip-600"].includes(p.id),
      )
      .map((p) => ({ ...p, commercialElementCounts: [6, 8, 10] }));
    const constraints = { manufacturer: "", family: "", numberOfRadiators: 2 };
    const mixed = sizeRadiators(1695, catalog, 50, constraints)[0];
    const separate = catalog.flatMap((p) =>
      sizeRadiators(1695, [p], 50, {
        manufacturer: p.manufacturer,
        family: p.family,
        numberOfRadiators: 2,
      }),
    );
    expect(mixed.totalPowerW).toBe(1699);
    expect(mixed.totalPowerW).toBeLessThan(
      Math.min(...separate.map((s) => s.totalPowerW)),
    );
    expect(new Set(mixed.units.map((u) => u.variant.manufacturer)).size).toBe(
      2,
    );
    let project = createProject();
    project = addRectangle(project, project.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    project = applyRadiatorSolution(project, project.rooms[0].id, mixed, null);
    expect(new Set(project.radiators.map((r) => r.manufacturer)).size).toBe(2);
    expect(project.catalogVersions.Cordivari).toBeTruthy();
    expect(project.catalogVersions.Global).toBeTruthy();
    expect(project.radiators.every((r) => r.catalogVersion)).toBe(true);
    expect(() =>
      applyRadiatorSolution(
        project,
        project.rooms[0].id,
        { ...mixed, selectedManufacturer: "Global" },
        null,
      ),
    ).toThrow("famiglia scelta");
  });
  it("tre VIP misti raggiungono 2400 W con 564 + 852 + 984 W reali", () => {
    const result = sizeRadiators(2400, radiatorProducts, 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 3,
      maxWidthMm: 800,
      maxHeightMm: 700,
    })[0];
    expect(result.totalPowerW).toBe(2400);
    expect(result.unitPowerW).toEqual([564, 852, 984]);
    expect(result.searchComplete).toBe(true);
  });
  it("confronta ricerca mista a ΔT40 con enumerazione indipendente di batterie reali", () => {
    const catalog = radiatorProducts
      .filter((p) =>
        ["global-vip-350", "global-vip-500", "global-vip-600"].includes(p.id),
      )
      .map((p) => ({ ...p, commercialElementCounts: [6, 8, 10] }));
    const options = catalog.flatMap((p) =>
      p.commercialElementCounts.map((elements) => ({
        p,
        elements,
        power: elementOutputAtDeltaT(p, 40) * elements,
        width: radiatorWidth(p, elements),
      })),
    );
    const required = 2100;
    const exhaustive = options
      .flatMap((a) =>
        options.flatMap((b) =>
          options.map((c) => ({
            power: a.power + b.power + c.power,
            width: a.width + b.width + c.width,
          })),
        ),
      )
      .filter((s) => s.power >= required)
      .sort((a, b) => a.power - b.power || a.width - b.width)[0];
    const result = sizeRadiators(required, catalog, 40, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 3,
    })[0];
    expect(result.totalPowerW).toBeCloseTo(exhaustive.power, 10);
    expect(result.widthsMm.reduce((a, b) => a + b, 0)).toBe(exhaustive.width);
    expect(result.totalPowerW).toBeGreaterThanOrEqual(required);
    expect(result.searchComplete).toBe(true);
  });
  it.each([3, 4, 5])(
    "certifica %i radiatori contro enumerazione indipendente a ΔT50 e ΔT40",
    (count) => {
      const catalog = radiatorProducts
        .filter((p) =>
          ["global-vip-350", "global-vip-500", "global-vip-600"].includes(p.id),
        )
        .map((p) => ({ ...p, commercialElementCounts: [6, 8, 10] }));
      for (const delta of [50, 40]) {
        const options = catalog.flatMap((p) =>
          p.commercialElementCounts.map((elements) => ({
            p,
            elements,
            output: elementOutputAtDeltaT(p, delta) * elements,
            width: radiatorWidth(p, elements),
          })),
        );
        const required = count * 650;
        let brute: { power: number; width: number } | null = null;
        const enumerate = (selected: typeof options, start: number): void => {
          if (selected.length === count) {
            const ordered = [...selected].sort(
              (a, b) => a.output - b.output || a.p.id.localeCompare(b.p.id),
            );
            const power = ordered.reduce((s, u) => s + u.output, 0),
              width = ordered.reduce((s, u) => s + u.width, 0);
            if (
              power >= required &&
              (!brute ||
                power < brute.power ||
                (power === brute.power && width < brute.width))
            )
              brute = { power, width };
            return;
          }
          for (let index = start; index < options.length; index++)
            enumerate([...selected, options[index]], index);
        };
        enumerate([], 0);
        const result = sizeRadiators(required, catalog, delta, {
          family: "VIP",
          manufacturer: "Global",
          numberOfRadiators: count,
        })[0];
        expect(brute).not.toBeNull();
        expect(result.totalPowerW).toBeCloseTo(brute!.power, 10);
        expect(result.widthsMm.reduce((s, w) => s + w, 0)).toBe(brute!.width);
        expect(result.totalPowerW).toBeGreaterThanOrEqual(required);
        expect(result.searchComplete).toBe(true);
      }
    },
  );
  it("mantiene batterie commerciali e vincoli min/max nelle varianti miste", () => {
    const result = sizeRadiators(2400, radiatorProducts, 50, {
      family: "Ardesia 4 colonne",
      manufacturer: "Cordivari",
      numberOfRadiators: 3,
      minElements: 8,
      maxElements: 12,
      maxWidthMm: 600,
      maxHeightMm: 700,
      maxDepthMm: 148,
    })[0];
    expect(result).toBeDefined();
    for (const unit of result.units) {
      expect(unit.variant.commercialElementCounts).toContain(unit.elements);
      expect(unit.elements).toBeGreaterThanOrEqual(8);
      expect(unit.elements).toBeLessThanOrEqual(12);
      expect(unit.widthMm).toBeLessThanOrEqual(600);
      expect(unit.variant.heightMm).toBeLessThanOrEqual(700);
      expect(unit.variant.depthMm).toBeLessThanOrEqual(148);
    }
  });
  it("certifica 10 batterie Ardesia nominali che superavano il vecchio limite di ricerca", () => {
    const start = performance.now();
    const result = sizeRadiators(12000, radiatorProducts, 50, {
      family: "Ardesia 4 colonne",
      manufacturer: "Cordivari",
      numberOfRadiators: 10,
      maxWidthMm: 800,
      maxHeightMm: 700,
    })[0];
    expect(performance.now() - start).toBeLessThan(5000);
    expect(result.units).toHaveLength(10);
    expect(result.totalPowerW).toBe(12000);
    expect(result.searchComplete).toBe(true);
    expect(result.widthsMm.reduce((sum, w) => sum + w, 0)).toBe(6174);
    expect(result.log.at(-1)).toContain("Ricerca completa");
    expect(
      result.units.every((u) =>
        u.variant.commercialElementCounts.includes(u.elements),
      ),
    ).toBe(true);
  });
  it("rifiuta ΔT e vincoli invalidi anche senza candidati", () => {
    const constraints = {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 2,
    };
    expect(() => sizeRadiators(2400, [], NaN, constraints)).toThrow();
    expect(() =>
      sizeRadiators(2400, radiatorProducts, 50, {
        ...constraints,
        maxWidthMm: -1,
      }),
    ).toThrow();
    expect(() =>
      sizeRadiators(2400, radiatorProducts, 50, {
        ...constraints,
        minElements: 10,
        maxElements: 5,
      }),
    ).toThrow();
  });
  it("schema rifiuta dati tecnici negativi e doppioni", () => {
    const c = radiatorCatalogs[1];
    expect(() =>
      radiatorCatalogSchema.parse({
        ...c,
        products: [...c.products, c.products[0]],
      }),
    ).toThrow();
    expect(() =>
      radiatorCatalogSchema.parse({
        ...c,
        products: [{ ...c.products[0], elementOutputW: -100 }],
      }),
    ).toThrow();
  });
  it("posiziona ingombro netto reale, persiste fonte e famiglia", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 5,
      length: 4,
      height: 2.7,
      name: "Camera",
    });
    const solution = sizeRadiators(p.rooms[0].designLoadW, [vip()], 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 1,
    })[0];
    p = applyRadiatorSolution(p, p.rooms[0].id, solution, null);
    expect(p.radiators).toHaveLength(1);
    expect(p.radiators[0].widthMm).toBe(1120);
    expect(p.rooms[0].systemType).toBe("radiator");
    expect(p.catalogVersions.Global).toBeTruthy();
  });
  it("applica varianti miste con singole dimensioni, rese e codici persistenti", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 5,
      length: 5,
      height: 2.7,
      name: "Camera",
    });
    const solution = sizeRadiators(2400, radiatorProducts, 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 2,
      maxWidthMm: 800,
      maxHeightMm: 700,
    })[0];
    p = applyRadiatorSolution(p, p.rooms[0].id, solution, null);
    expect(
      p.radiators.map((r) => [r.productId, r.elements, r.heightMm, r.outputW]),
    ).toEqual(
      solution.units.map((u) => [
        u.variant.id,
        u.elements,
        u.variant.heightMm,
        u.powerW,
      ]),
    );
    expect(
      p.radiators.every(
        (r) => r.wallId && r.catalogVersion && r.family === "VIP",
      ),
    ).toBe(true);
    expect(p.radiators.reduce((s, r) => s + r.outputW, 0)).toBe(2404);
  });
  it("rifiuta risultati precedenti se la stanza cresce o il contorno diventa irrisolto", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 5,
      length: 5,
      height: 2.7,
      name: "Camera",
    });
    const solution = sizeRadiators(1500, [vip()], 50, {
      family: "VIP",
      manufacturer: "Global",
      numberOfRadiators: 1,
    })[0];
    expect(() =>
      applyRadiatorSolution(p, p.rooms[0].id, solution, null),
    ).toThrow("fabbisogno attuale");
    p.rooms[0].geometryStatus = "unresolved";
    expect(() =>
      applyRadiatorSolution(p, p.rooms[0].id, solution, null),
    ).toThrow("Chiudere il contorno");
  });
});
