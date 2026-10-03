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
});
