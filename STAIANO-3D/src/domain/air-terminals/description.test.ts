import { expect, it } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { airTerminalModelDescription } from "./description";

it("preserves published model sizes instead of silently ordering by face envelope", () => {
  const grille = airTerminalCatalog.families.find(
    (family) => family.familyCode === "EBLF",
  )!;
  const variant = grille.variants.find(
    (item) => item.widthMm === 400 && item.heightMm === 150,
  )!;
  expect([variant.faceWidthMm, variant.faceHeightMm]).toEqual([399, 149]);
  expect(airTerminalModelDescription(grille, variant.id)).toContain(
    "400×150 mm nominali",
  );
  const valve = airTerminalCatalog.families.find(
    (family) => family.familyCode === "EVVMC",
  )!;
  expect(valve.variants[0].faceWidthMm).toBe(116);
  expect(airTerminalModelDescription(valve, "ecoclima-evvmc-80")).toContain(
    "nominale 80 mm",
  );
  const linear = airTerminalCatalog.families.find(
    (family) => family.familyCode === "EDLS",
  )!;
  expect(airTerminalModelDescription(linear, "ecoclima-edls-3f-30")).toContain(
    "3 feritoie da 30 mm",
  );
  expect(airTerminalModelDescription(null, "missing")).toContain(
    "non verificabile",
  );
});
