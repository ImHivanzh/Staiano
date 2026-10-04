import { describe, expect, it } from "vitest";
import {
  createProject,
  addRectangle,
  recomputeProject,
} from "@/domain/project";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { sizeRadiators } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import {
  duplicateSelection,
  removeSelection,
  translateSelection,
} from "./selection";
import { validateProject } from "@/domain/validation";
import { decodeProject, encodeProject } from "@/services/project/format";

function fixture() {
  let p = createProject();
  p = addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 3,
    name: "Studio",
  });
  const room = p.rooms[0];
  const solution = sizeRadiators(
    room.designLoadW,
    radiatorProducts.filter(
      (v) => v.manufacturer === "Global" && v.family === "VIP",
    ),
    50,
    { manufacturer: "Global", family: "VIP", numberOfRadiators: 2 },
  )[0];
  return applyRadiatorSolution(p, room.id, solution, null);
}

describe("selection geometry and data preservation", () => {
  it("preserves opening metadata on copy and round-trip and validates impossible dimensions", () => {
    const p = fixture();
    p.openings = [
      {
        id: "door-copy",
        floorId: p.floors[0].id,
        wallId: p.walls[0].id,
        offsetM: 1,
        widthM: 0.8,
        heightM: 2.1,
        type: "door",
        sillHeightM: null,
      },
    ];
    const copied = duplicateSelection(p, [{ kind: "room", id: p.rooms[0].id }]);
    expect(copied.openings).toHaveLength(2);
    const restored = decodeProject(encodeProject(copied));
    expect(restored.openings).toEqual(copied.openings);
    expect(
      validateProject(restored)
        .filter((check) => check.code === "openingDimensions")
        .every((check) => check.status === "valid"),
    ).toBe(true);
    restored.openings[0].widthM = 100;
    expect(
      validateProject(restored).find((check) => check.entityId === "door-copy")
        ?.status,
    ).toBe("invalid");
  });
  it("copies complete rooms with names, height and physical devices into free space", () => {
    const p = fixture();
    const next = duplicateSelection(p, [{ kind: "room", id: p.rooms[0].id }]);
    expect(next.rooms).toHaveLength(2);
    expect(next.walls).toHaveLength(8);
    expect(next.radiators).toHaveLength(4);
    const room = next.rooms.find((r) => r.id !== p.rooms[0].id)!;
    expect(room.name).toBe("Studio — copia");
    expect(room.heightM).toBe(3);
    expect(room.designLoadW).toBeCloseTo(p.rooms[0].designLoadW);
    expect(
      next.radiators
        .filter((d) => d.roomId === room.id)
        .map((d) => d.productId),
    ).toEqual(p.radiators.map((d) => d.productId));
    expect(
      validateProject(next).filter((check) => check.status === "invalid"),
    ).toEqual([]);
    expect(decodeProject(encodeProject(next)).radiators).toHaveLength(4);
  });

  it("translates a room plus selected attached devices exactly once", () => {
    const p = fixture();
    const next = translateSelection(
      p,
      [
        { kind: "room", id: p.rooms[0].id },
        { kind: "device", id: p.radiators[0].id },
      ],
      { x: 2, y: 1 },
    );
    expect(next.rooms[0].centroid.x).toBeCloseTo(p.rooms[0].centroid.x + 2);
    expect(next.rooms[0].designLoadW).toBeCloseTo(p.rooms[0].designLoadW);
    for (const before of p.radiators) {
      const after = next.radiators.find((d) => d.id === before.id)!;
      expect(after.position.x).toBeCloseTo(before.position.x + 2);
      expect(after.position.y).toBeCloseTo(before.position.y + 1);
    }
  });

  it("preserves devices when a contour opens, removes them only on explicit room deletion", () => {
    const p = fixture();
    const opened = removeSelection(p, [{ kind: "wall", id: p.walls[0].id }]);
    expect(opened.rooms[0].geometryStatus).toBe("unresolved");
    expect(opened.radiators.map((d) => d.id)).toEqual(
      p.radiators.map((d) => d.id),
    );
    expect(
      validateProject(opened).find((check) => check.code === "geometry")
        ?.status,
    ).toBe("invalid");
    const restored = recomputeProject({ ...opened, walls: p.walls });
    expect(restored.rooms[0].geometryStatus).toBe("closed");
    expect(restored.radiators.map((d) => d.id)).toEqual(
      p.radiators.map((d) => d.id),
    );
    const removed = removeSelection(p, [{ kind: "room", id: p.rooms[0].id }]);
    expect(removed.rooms).toHaveLength(0);
    expect(removed.radiators).toHaveLength(0);
  });

  it("device-only copy creates a new identity and leaves original data unchanged", () => {
    const p = fixture();
    const next = duplicateSelection(p, [
      { kind: "device", id: p.radiators[0].id },
    ]);
    expect(next.radiators).toHaveLength(3);
    expect(next.radiators.find((d) => d.id === p.radiators[0].id)).toEqual(
      p.radiators[0],
    );
    expect(new Set(next.radiators.map((d) => d.id)).size).toBe(3);
  });
});
