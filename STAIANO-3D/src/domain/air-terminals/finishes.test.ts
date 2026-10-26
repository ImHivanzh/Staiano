import { expect, it } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { ecoclimaPriceCatalog } from "@/domain/catalogs/ecoclima-prices";
import {
  isTerminalFinishAvailable,
  terminalFinishChoices,
  terminalFinishLabel,
  terminalFinishPrice,
} from "./finishes";

it("labels RAL colours and distinguishes anodized aluminium without guessing a colour", () => {
  expect(terminalFinishLabel("RAL9016")).toBe("RAL 9016 · Bianco");
  expect(terminalFinishLabel("RAL9005")).toBe("RAL 9005 · Nero");
  expect(terminalFinishLabel("Alluminio anodizzato naturale")).toContain(
    "colore non specificato",
  );
  const edls = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  expect(terminalFinishChoices(edls)).toEqual(["RAL9005", "RAL9016"]);
});

it("offers the published colours for Ecoclima multi-slot diffusers", () => {
  const edlh = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLH",
  )!;
  const edfl = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDFL-10",
  )!;
  const edflna = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDFLNA-10",
  )!;

  expect(terminalFinishChoices(edlh)).toEqual(["RAL9005", "RAL9016"]);
  expect(isTerminalFinishAvailable(edfl, "RAL7035")).toBe(true);
  expect(isTerminalFinishAvailable(edflna, "RAL7035")).toBe(true);
});

it("offers custom RAL only where published, rejecting malformed codes", () => {
  const eba = airTerminalCatalog.families.find((f) => f.familyCode === "EBA")!;
  const ega6 = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EGA6",
  )!;
  expect(isTerminalFinishAvailable(eba, "RAL7035")).toBe(true);
  expect(isTerminalFinishAvailable(eba, "RAL70")).toBe(false);
  expect(isTerminalFinishAvailable(ega6, "RAL7035")).toBe(false);
  expect(terminalFinishChoices(ega6)).toEqual([
    "Alluminio anodizzato naturale",
    "RAL9016",
  ]);
});

it("applies +20% only to the published white finish, leaving other RAL prices unknown", () => {
  const price = ecoclimaPriceCatalog.prices.find(
    (p) => p.familyCode === "EGA6" && p.kind === "terminal",
  )!;
  expect(terminalFinishPrice(price, "Alluminio anodizzato naturale")).toBe(
    price.unitPriceCents,
  );
  expect(terminalFinishPrice(price, "RAL9016")).toBe(
    Math.round(price.unitPriceCents * 1.2),
  );
  expect(terminalFinishPrice(price, "RAL7035")).toBeNull();
  const white = ecoclimaPriceCatalog.prices.find(
    (p) => p.modelCode === "EDFLB-20" && p.kind === "terminal",
  )!;
  expect(terminalFinishPrice(white, "RAL9016")).toBe(white.unitPriceCents);
});
