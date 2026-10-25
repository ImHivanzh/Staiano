import { expect, it } from "vitest";
import {
  flexibleDuctMinimumRadiusFactor,
  flexibleDuctPressureLossPaM,
  flexibleDuctProducts,
} from "./flexible-ducts";

it("keeps ETF10 radius and loss data tied to its published SKU/diameters", () => {
  expect(flexibleDuctProducts[0].sourceMetadata.documentRevision).toBe(
    "01/2024",
  );
  expect(flexibleDuctMinimumRadiusFactor("ecoclima-etf10", 80)).toBe(0.6);
  expect(flexibleDuctMinimumRadiusFactor("ecoclima-etf10", 100)).toBe(1);
  expect(flexibleDuctMinimumRadiusFactor(null, 80)).toBe(1);
  expect(flexibleDuctPressureLossPaM("ecoclima-etf10", 80, 80)).toBe(6.5);
  expect(flexibleDuctPressureLossPaM("ecoclima-etf10", 160, 1000)).toBe(25);
  expect(flexibleDuctPressureLossPaM("ecoclima-etf10", 160, 1100)).toBeNull();
});
