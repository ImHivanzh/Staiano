import { expect, it } from "vitest";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { sizeRadiatorsAcrossFamilies } from "./auto";
import { sizeRadiators } from "./size";

it("omitted brand/family compares actual catalogues and uses explicit one-radiator default", () => {
  const result = sizeRadiatorsAcrossFamilies(1508, radiatorProducts, 50, {});
  const families = [
    ...new Set(radiatorProducts.map((v) => `${v.manufacturer}\0${v.family}`)),
  ];
  const independent = families.flatMap((key) => {
    const [manufacturer, family] = key.split("\0");
    return sizeRadiators(1508, radiatorProducts, 50, {
      manufacturer,
      family,
      numberOfRadiators: 1,
    });
  });
  expect(result.length).toBeGreaterThan(0);
  expect(result[0].excessW).toBe(
    Math.min(...independent.map((s) => s.excessW)),
  );
  expect(
    result.every((s) => s.units.length === 1 && s.totalPowerW >= 1508),
  ).toBe(true);
});

it("locked family remains locked and geometric constraints are propagated", () => {
  const result = sizeRadiatorsAcrossFamilies(1508, radiatorProducts, 50, {
    family: "VIP",
    maxWidthMm: 1000,
    maxHeightMm: 700,
  });
  expect(result.length).toBeGreaterThan(0);
  expect(
    result.every((s) =>
      s.units.every(
        (u) =>
          u.variant.family === "VIP" &&
          u.widthMm <= 1000 &&
          u.variant.heightMm <= 700,
      ),
    ),
  ).toBe(true);
});
