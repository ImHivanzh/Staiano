import { expect, it } from "vitest";
import { hvacCatalog, hvacDischargeConnection } from "@/domain/catalogs/hvac";
import { ductedOpening } from "./DuctedMachineBody";

it("uses documented clear discharge openings and keeps undimensioned flanges representative", () => {
  expect(ductedOpening(1000, 250, null)).toEqual([0.8, 0.15]);
  for (const product of hvacCatalog.products) {
    if (!product.widthMm || !product.heightMm) continue;
    const connection = hvacDischargeConnection(product);
    const [w, h] = ductedOpening(product.widthMm, product.heightMm, connection);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(product.widthMm / 1000);
    expect(h).toBeLessThanOrEqual(product.heightMm / 1000);
    if (connection?.clearOpeningWidthMm)
      expect(w).toBeCloseTo(
        Math.min(product.widthMm * 0.94, connection.clearOpeningWidthMm) / 1000,
        8,
      );
  }
});
