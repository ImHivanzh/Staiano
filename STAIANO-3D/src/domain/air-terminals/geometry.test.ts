import { expect, it } from "vitest";
import { airTerminalCatalog } from "../catalogs/air-terminals";
import { terminalBodyDepthMm } from "./geometry";
import { linearTerminalSlots } from "@/configurator/viewer3d/device-detail";

it("models exactly three EDFL openings even though the data does not separately record slot width", () => {
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDFL-20",
  )!;
  const variant = family.variants.find((v) => v.slotCount === 3)!;
  expect(variant.slotWidthMm).toBeNull();
  expect(
    linearTerminalSlots(variant, 1, variant.faceHeightMm! / 1000, 0),
  ).toHaveLength(3);
  expect(terminalBodyDepthMm(family, variant)).toBe(52);
});

it("keeps existing verified depths and does not assign EDFL depths to unrelated unknown profiles", () => {
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === "EDLS",
  )!;
  expect(terminalBodyDepthMm(family, family.variants[0])).toBe(
    family.variants[0].bodyDepthMm,
  );
  expect(terminalBodyDepthMm(null, undefined)).toBeNull();
});
