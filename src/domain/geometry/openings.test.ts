import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import { decodeProject, encodeProject } from "@/services/project/format";
import { validateProject } from "@/domain/validation";
import { saveOpening } from "./openings";

const fixture = () => {
  const p = createProject();
  return addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Studio",
  });
};
describe("measured openings and legacy elevations", () => {
  it("persists a real sill, leaves room thermal dimensions unchanged and edits the same opening", () => {
    const p = fixture();
    const next = saveOpening(p, p.walls[0].id, {
      type: "window",
      offsetM: 1,
      widthM: 1.2,
      heightM: 1.1,
      sillHeightM: 0.95,
    });
    const restored = decodeProject(encodeProject(next));
    expect(restored.openings[0].sillHeightM).toBe(0.95);
    expect(restored.rooms[0].designLoadW).toBe(p.rooms[0].designLoadW);
    const edited = saveOpening(
      restored,
      p.walls[0].id,
      { ...restored.openings[0], widthM: 1.4 },
      restored.openings[0].id,
    );
    expect(edited.openings).toHaveLength(1);
    expect(edited.openings[0].widthM).toBe(1.4);
  });
  it("rejects overheight, overlength, overlap and an unspecified new window elevation", () => {
    const p = fixture(),
      wall = p.walls[0].id;
    const window = {
      type: "window" as const,
      offsetM: 1,
      widthM: 1.2,
      heightM: 1.1,
      sillHeightM: 0.95,
    };
    expect(() => saveOpening(p, wall, { ...window, sillHeightM: 1.8 })).toThrow(
      /altezza/,
    );
    expect(() => saveOpening(p, wall, { ...window, offsetM: 4 })).toThrow(
      /lunghezza/,
    );
    expect(() =>
      saveOpening(p, wall, { ...window, sillHeightM: null }),
    ).toThrow(/davanzale/);
    const next = saveOpening(p, wall, window);
    expect(() =>
      saveOpening(next, wall, {
        type: "door",
        offsetM: 1.5,
        widthM: 0.9,
        heightM: 2.1,
        sillHeightM: 0,
      }),
    ).toThrow(/altra apertura/);
  });
  it("loads old windows without inventing their elevation, warning rather than a fake valid placement", () => {
    const p = fixture();
    const raw = {
      ...p,
      openings: [
        {
          id: "legacy-window",
          wallId: p.walls[0].id,
          floorId: p.floors[0].id,
          type: "window",
          offsetM: 1,
          widthM: 1.2,
          heightM: 1.1,
        },
      ],
    };
    const parsed = projectSchema.parse(raw);
    expect(parsed.openings[0].sillHeightM).toBeNull();
    expect(
      validateProject(parsed).find((c) => c.code === "openingElevation")
        ?.status,
    ).toBe("warning");
    parsed.openings[0].sillHeightM = 2;
    expect(
      validateProject(parsed).find((c) => c.code === "openingDimensions")
        ?.status,
    ).toBe("invalid");
  });
});
