import { expect, it } from "vitest";
import { airTerminalCatalog } from "./air-terminals";

it.each([
  [
    "EMV-S",
    [
      [154, 110, 15],
      [187, 142, 15],
      [204, 179, 16],
      [250, 214, 14],
    ],
  ],
  [
    "EMV-J",
    [
      [154, 110, 15],
      [186, 142, 15],
      [250, 214, 15],
    ],
  ],
] as const)("uses published B/H/L axes for %s face geometry", (code, dimensions) => {
  const family = airTerminalCatalog.families.find(
    (candidate) => candidate.familyCode === code,
  )!;
  expect(
    family.variants.map((variant) => [
      variant.faceWidthMm,
      variant.faceHeightMm,
      variant.bodyDepthMm,
    ]),
  ).toEqual(dimensions);
  expect(
    family.variants.map((variant) => [
      variant.originalDimensionsMm?.B,
      variant.originalDimensionsMm?.H,
      variant.originalDimensionsMm?.L,
    ]),
  ).toEqual(dimensions);
});
