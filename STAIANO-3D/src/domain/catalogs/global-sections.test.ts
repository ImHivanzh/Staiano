import { describe, expect, it } from "vitest";
import { radiatorProducts } from "./radiators";
import { globalSectionFor, globalSectionVertexY } from "./global-sections";

const item = (p: (typeof radiatorProducts)[number], elements: number) => ({
  manufacturer: p.manufacturer,
  elements,
  widthMm: elements * p.pitchMm,
  heightMm: p.heightMm,
  depthMm: p.depthMm,
});

describe("Global VIP/OSCAR cast element", () => {
  it("covers every VIP and OSCAR variant but not OSCAR TONDO", () => {
    for (const p of radiatorProducts.filter((x) => x.manufacturer === "Global")) {
      const section = globalSectionFor(item(p, 4), p);
      expect(section === null).toBe(p.family === "OSCAR TONDO");
    }
  });

  it("moves the two end zones rigidly and the bottom/top edges to the catalogue height", () => {
    const section = { referenceMm: 690 };
    for (const height of [440, 590, 690, 890]) {
      expect(globalSectionVertexY(-0.345, height, section)).toBeCloseTo(-height / 2000);
      expect(globalSectionVertexY(0.345, height, section)).toBeCloseTo(height / 2000);
      // a point in the fixed bottom zone keeps its distance from the bottom edge
      expect(globalSectionVertexY(-0.3, height, section) + height / 2000).toBeCloseTo(0.045);
    }
  });

  it("refuses edited sizes and puts connections at interaxis/2", () => {
    const p = radiatorProducts.find((x) => x.id === "global-vip-600")!;
    expect(globalSectionFor({ ...item(p, 5), widthMm: 399 }, p)).toBeNull();
    expect(globalSectionFor(item(p, 5), p)?.connectionAboveBottomM).toBeCloseTo(0.045);
  });
});
