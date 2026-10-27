import { expect, it } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { terminalFaceDetail, terminalPattern } from "./terminal-detail";

it.each([
  ["EDLS", "slots"],
  ["EDE1", "swirl"],
  ["EGF", "perforated"],
  ["EDQMQ", "jets"],
  ["EDU", "nozzle"],
  ["EDRA", "cones"],
  ["EDRCS", "vanes"],
  ["EDRFB", "vanes"],
  ["EDFDS", "vanes"],
  ["EVVMC", "valve"],
  ["EDSC-Q", "valve"],
  ["EGQR", "grid"],
  ["EADD", "four-way"],
  ["EBA", "grid"],
  ["EBL", "slats"],
])("distinguishes the %s face as %s", (code, expected) => {
  expect(
    terminalPattern(
      airTerminalCatalog.families.find((f) => f.familyCode === code)!,
    ),
  ).toBe(expected);
});

it("keeps reconstructed faces finite, positive and inside the catalog width/height", () => {
  let checked = 0;
  for (const family of airTerminalCatalog.families)
    for (const variant of family.variants) {
      const width = variant.faceWidthMm ?? variant.widthMm ?? variant.lengthMm;
      const height = variant.faceHeightMm ?? variant.heightMm;
      if (!width || !height) continue;
      checked++;
      const w = width / 1000,
        h = height / 1000;
      const detail = terminalFaceDetail(
        family,
        variant,
        w,
        h,
        0.02,
        family.shape === "circle",
      );
      for (const part of [...detail.white, ...detail.dark]) {
        expect(
          [...part.position, ...part.scale].every(Number.isFinite),
          variant.id,
        ).toBe(true);
        expect(
          part.scale.every((v) => v > 0),
          variant.id,
        ).toBe(true);
        const angle = part.rotation?.[2] ?? 0;
        const halfX =
          (Math.abs(Math.cos(angle)) * part.scale[0] +
            Math.abs(Math.sin(angle)) * part.scale[1]) /
          2;
        const halfY =
          (Math.abs(Math.sin(angle)) * part.scale[0] +
            Math.abs(Math.cos(angle)) * part.scale[1]) /
          2;
        expect(
          Math.abs(part.position[0]) + halfX,
          variant.id,
        ).toBeLessThanOrEqual(w / 2 + 1e-8);
        expect(
          Math.abs(part.position[1]) + halfY,
          variant.id,
        ).toBeLessThanOrEqual(h / 2 + 1e-8);
      }
      for (const part of [...detail.holes, ...detail.rings, ...detail.discs]) {
        expect(
          [...part.position, ...part.scale].every(Number.isFinite),
          variant.id,
        ).toBe(true);
        expect(
          part.scale.every((v) => v > 0),
          variant.id,
        ).toBe(true);
        expect(
          Math.abs(part.position[0]) + part.scale[0],
          variant.id,
        ).toBeLessThanOrEqual(w / 2 + 1e-8);
        expect(
          Math.abs(part.position[1]) + part.scale[1],
          variant.id,
        ).toBeLessThanOrEqual(h / 2 + 1e-8);
      }
    }
  expect(checked).toBeGreaterThan(1500);
});
