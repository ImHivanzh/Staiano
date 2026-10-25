import { expect, it } from "vitest";
import { splitCatalog } from "@/domain/catalogs/splits";
import { cassetteDetail, roundCassetteGrille } from "./cassette-detail";

it("clips circular cassette intake slats to the round central face", () => {
  const parts = roundCassetteGrille(1050, 330, 1050);
  expect(parts).toHaveLength(11);
  for (const part of parts) {
    expect(Math.hypot(part.scale[0] / 2, part.position[2])).toBeCloseTo(
      1.05 * 0.25,
      8,
    );
    expect(part.position[1]).toBeLessThan(-0.165);
    expect(part.scale.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
  }
});

it("gives every rectangular ceiling cassette four underside outlets and a central grille inside its saved envelope", () => {
  const units = splitCatalog.indoorUnits.filter(
    (p) => p.mounting === "ceiling" && p.shape !== "round",
  );
  expect(units).toHaveLength(2);
  for (const unit of units) {
    const detail = cassetteDetail(unit.widthMm, unit.heightMm, unit.depthMm);
    expect(detail.outlets).toHaveLength(4);
    expect(detail.vanes).toHaveLength(4);
    expect(detail.grille).toHaveLength(12);
    expect(new Set(detail.outlets.map((p) => p.position.join(","))).size).toBe(
      4,
    );
    for (const part of [
      detail.body,
      ...detail.frame,
      detail.intake,
      ...detail.grille,
      ...detail.outlets,
      ...detail.vanes,
    ]) {
      const limits = [unit.widthMm, unit.heightMm, unit.depthMm];
      part.position.forEach((value, axis) => {
        expect(Math.abs(value) + part.scale[axis] / 2).toBeLessThanOrEqual(
          limits[axis] / 2000 + 1e-8,
        );
      });
    }
    expect(detail.outlets.every((p) => p.position[1] < 0)).toBe(true);
    for (const hole of [detail.intake, ...detail.outlets])
      expect(
        detail.frame.every(
          (part) =>
            Math.abs(part.position[0] - hole.position[0]) > part.scale[0] / 2 ||
            Math.abs(part.position[2] - hole.position[2]) > part.scale[2] / 2,
        ),
      ).toBe(true);
  }
});
