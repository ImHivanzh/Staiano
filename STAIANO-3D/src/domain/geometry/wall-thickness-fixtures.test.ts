import { describe, expect, it } from "vitest";
import { largeProjectFixture } from "../../../tests/large-project";
import { realisticProjectFixture } from "../../../tests/realistic-project";
import { validateProject } from "@/domain/validation";
import { area } from "./primitives";
import { applyWallThicknessPreservingInterior } from "./wall-thickness";

describe("spessore globale sui progetti di verifica", () => {
  it("quattro ambienti con muri condivisi restano in quota", () => {
    const project = realisticProjectFixture();
    const before = new Map(
      project.rooms.map((room) => [room.id, area(room.polygon)]),
    );
    const next = applyWallThicknessPreservingInterior(project, {
      internalWallThicknessM: 0.2,
      externalWallThicknessM: 0.4,
    });
    expect(next.rooms).toHaveLength(project.rooms.length);
    for (const room of next.rooms) {
      const previous = before.get(room.id);
      expect(previous).toBeDefined();
      expect(area(room.polygon)).toBeCloseTo(previous!, 6);
    }
    expect(next.radiators).toHaveLength(project.radiators.length);
    expect(
      validateProject(next).find((check) => check.code === "overlap")?.status,
    ).toBe("valid");
    expect(
      validateProject(next).find((check) => check.code === "closure")?.status,
    ).not.toBe("warning");
  });

  it("cinquanta ambienti indipendenti mantengono le superfici", () => {
    const project = largeProjectFixture();
    const before = new Map(
      project.rooms.map((room) => [room.id, area(room.polygon)]),
    );
    const next = applyWallThicknessPreservingInterior(project, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.5,
    });
    expect(next.rooms).toHaveLength(project.rooms.length);
    expect(next.walls.every((wall) => wall.thickness === 0.5)).toBe(true);
    for (const room of next.rooms) {
      const previous = before.get(room.id);
      expect(previous).toBeDefined();
      expect(area(room.polygon)).toBeCloseTo(previous!, 6);
    }
  });
});
