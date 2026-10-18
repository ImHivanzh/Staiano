import { expect, it } from "vitest";
import {
  ecoclimaCommercialCatalog,
  commercialCatalogSchema,
} from "./ecoclima-commercial";
import { airTerminalCatalog } from "./air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";

it("imports original EUR price rows with distinct source identity and SHA", () => {
  const pages = ecoclimaCommercialCatalog.families;
  expect(pages).toHaveLength(9);
  expect(new Set(pages.map((page) => page.id)).size).toBe(9);
  const eadd = pages.find((page) => page.familyCode === "EADD")!;
  expect(eadd.tables[0].find((row) => row[0] === "EADD-80")).toEqual([
    "EADD-80",
    "56,39",
  ]);
  expect(eadd.sourceMetadata.sourceType).toBe("html");
  expect(pages.filter((page) => page.familyCode === "EGQ")).toHaveLength(2);
  const duplicate = structuredClone(ecoclimaCommercialCatalog);
  duplicate.families.push(duplicate.families[0]);
  expect(commercialCatalogSchema.safeParse(duplicate).success).toBe(false);
});

it("price metadata cannot influence technical ranking", () => {
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  const describe = () =>
    sizeAirTerminal(480, 2, family, "supply").map((s) => ({
      id: s.variant.id,
      count: s.quantityPerPoint,
      length: s.commercialLengthM,
      flow: s.availableAirflowPerPointM3h,
    }));
  const before = describe();
  const prices = ecoclimaCommercialCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  const saved = structuredClone(prices.tables);
  try {
    prices.tables = [[["€"], ["999999,99"]]];
    expect(describe()).toEqual(before);
  } finally {
    prices.tables = saved;
  }
});
