import { expect, it } from "vitest";
import {
  airTerminalCatalog,
  airTerminalMountings,
} from "../catalogs/air-terminals";
import { airTerminalFaceWidthMm, terminalBodyDepthMm } from "./geometry";
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
  expect(family.linearFaceLengthOffsetMm).toBe(50);
  expect(airTerminalMountings(family)).toEqual(["wall", "ceiling"]);
  expect(family.supportingSources?.[0].sourceMetadata).toMatchObject({
    sha256: "273a781cdc0ba9cb6bbebc0a3688b60ac02a75c9b954c34b3efc84609a492afe",
    page: 2,
  });
  expect(
    airTerminalFaceWidthMm({
      family: family.familyCode,
      catalogVersion: airTerminalCatalog.version,
      widthMm: 1000,
    }),
  ).toBe(1050);
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
