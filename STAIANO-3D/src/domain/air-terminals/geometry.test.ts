import { expect, it } from "vitest";
import { addOperatorTerminal, editOperatorTerminal } from "./operator";
import { threeRoomTerminalFixture } from "../../../tests/guided-fixture";
import {
  airTerminalCatalog,
  airTerminalMountings,
} from "../catalogs/air-terminals";
import {
  airTerminalFaceWidthMm,
  terminalBodyDepthMm,
  terminalFaceDimensions,
  preferredEdlsProfile,
} from "./geometry";

it("uses nominal sizes only when precise face sizes are absent", () => {
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "ETA",
  )!;
  const nominal = family.variants[0];
  expect(terminalFaceDimensions(family, nominal)).toMatchObject({
    widthMm: nominal.widthMm,
    heightMm: nominal.heightMm,
    nominal: true,
  });
  expect(
    terminalFaceDimensions(family, {
      ...nominal,
      faceWidthMm: 299,
      faceHeightMm: 99,
    }),
  ).toEqual({ widthMm: 299, heightMm: 99, nominal: false });
  expect(
    terminalBodyDepthMm(family, { ...nominal, bodyDepthMm: null, depthMm: 40 }),
  ).toBe(40);
});

it("prefers white EDLSB series 20 with the selected FA or FB slot width", () => {
  expect(preferredEdlsProfile(20, "RAL9016")).toBe("EDLSB20-FA");
  expect(preferredEdlsProfile(30, "RAL9016")).toBe("EDLSB20-FB");
  expect(preferredEdlsProfile(20, "RAL9005")).toBe("EDLS20-FA");
});

it("persists white EDLSB20 defaults and follows slot/colour edits", () => {
  const project = threeRoomTerminalFixture();
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EDLS",
  )!;
  const fa = family.variants.find(
    (item) =>
      item.slotWidthMm === 20 &&
      item.operatingPoints.some(
        (point) =>
          point.quality === "valid" &&
          (point.noiseUpperBoundDbA ?? point.noiseDbA ?? Infinity) <= 37,
      ),
  )!;
  const index = fa.operatingPoints.findIndex(
    (point) =>
      point.quality === "valid" &&
      (point.noiseUpperBoundDbA ?? point.noiseDbA ?? Infinity) <= 37,
  );
  const next = addOperatorTerminal(project, {
    roomId: project.hvacSystems[0].roomIds[0],
    systemId: project.hvacSystems[0].id,
    familyCode: "EDLS",
    variantId: fa.id,
    operatingPointIndex: index,
    use: "supply",
    mounting: "ceiling",
    lengthMm: 1000,
  });
  const terminal = next.airTerminals.at(-1)!;
  expect(terminal).toMatchObject({
    color: "RAL9016",
    commercialOptions: { profileCode: "EDLSB20-FA", colorCode: "RAL9016" },
  });
  const edited = editOperatorTerminal(next, terminal.id, { color: "RAL9005" });
  expect(edited.airTerminals.at(-1)!.commercialOptions).toMatchObject({
    profileCode: "EDLS20-FA",
    colorCode: "RAL9005",
  });
});
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
