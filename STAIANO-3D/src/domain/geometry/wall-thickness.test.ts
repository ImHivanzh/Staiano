import { describe, expect, it } from "vitest";
import type { Wall } from "@/schemas/project";
import {
  addRectangle,
  addWall,
  createProject,
  newId,
  recomputeProject,
} from "@/domain/project";
import { validateProject } from "@/domain/validation";
import { roomRectSides } from "./dimensions";
import { saveOpening } from "./openings";
import { area, bounds, distance } from "./primitives";
import { applyWallThicknessPreservingInterior } from "./wall-thickness";
import { splitWall } from "./wall-commands";

const rectangle = () => {
  const empty = createProject();
  return addRectangle(empty, empty.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Soggiorno",
  });
};
const axisBox = (
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[],
) => bounds(walls.flatMap((wall) => [wall.start, wall.end]));

describe("spessore di tutti i muri con quote interne invariate", () => {
  it("i muri esterni crescono verso l'esterno e la stanza non cambia", () => {
    const project = rectangle();
    const before = project.rooms[0];
    const next = applyWallThicknessPreservingInterior(project, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.4,
    });
    expect(next.walls).toHaveLength(4);
    expect(
      next.walls.every(
        (wall) => wall.thickness === 0.4 && wall.type === "ESTERNO",
      ),
    ).toBe(true);
    expect(next.rooms).toHaveLength(1);
    const room = next.rooms.find((item) => item.id === before.id)!;
    expect(room.netAreaM2).toBeCloseTo(before.netAreaM2, 6);
    const sides = roomRectSides(room)!;
    expect(sides.width).toBeCloseTo(4.2, 6);
    expect(sides.length).toBeCloseTo(3.8, 6);
    const previous = axisBox(project.walls),
      current = axisBox(next.walls);
    expect(current.minX).toBeCloseTo(previous.minX - 0.05, 6);
    expect(current.maxX).toBeCloseTo(previous.maxX + 0.05, 6);
    expect(current.minY).toBeCloseTo(previous.minY - 0.05, 6);
    expect(current.maxY).toBeCloseTo(previous.maxY + 0.05, 6);
    expect(next.projectSettings.externalWallThicknessM).toBe(0.4);
  });

  it("l'apertura resta nella stessa posizione della faccia interna", () => {
    const project = rectangle();
    const withOpening = saveOpening(project, project.walls[0].id, {
      type: "door",
      offsetM: 1,
      widthM: 0.9,
      heightM: 2.1,
      sillHeightM: 0,
    });
    const next = applyWallThicknessPreservingInterior(withOpening, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.4,
    });
    const wall = next.walls.find(
      (item) => item.id === withOpening.walls[0].id,
    )!;
    const opening = next.openings[0];
    expect(opening.offsetM).toBeCloseTo(1.05, 6);
    expect(wall.start.x + opening.offsetM).toBeCloseTo(1, 6);
  });

  it("i muri interni allontanano gli ambienti senza ridurne le quote", () => {
    const project = rectangle();
    const divided = addWall(
      project,
      project.floors[0].id,
      { x: 2, y: 0 },
      { x: 2, y: 4.1 },
    );
    expect(divided.rooms).toHaveLength(2);
    const previous = new Map(divided.rooms.map((room) => [room.id, room]));
    const next = applyWallThicknessPreservingInterior(divided, {
      internalWallThicknessM: 0.2,
      externalWallThicknessM: 0.3,
    });
    expect(next.rooms).toHaveLength(2);
    for (const room of next.rooms) {
      const old = previous.get(room.id);
      expect(old).toBeDefined();
      expect(area(room.polygon)).toBeCloseTo(area(old!.polygon), 6);
      const oldSides = roomRectSides(old!)!,
        sides = roomRectSides(room)!;
      expect(sides.width).toBeCloseTo(oldSides.width, 6);
      expect(sides.length).toBeCloseTo(oldSides.length, 6);
    }
    const partition = next.walls.find(
      (wall) =>
        Math.abs(wall.start.x - wall.end.x) < 1e-9 && wall.thickness === 0.2,
    );
    expect(partition).toBeDefined();
    const left = next.rooms.toSorted(
        (a, b) => bounds(a.polygon).maxX - bounds(b.polygon).maxX,
      )[0],
      right = next.rooms.find((room) => room.id !== left.id)!;
    expect(bounds(right.polygon).minX - bounds(left.polygon).maxX).toBeCloseTo(
      0.2,
      6,
    );
    expect(
      validateProject(next).find((check) => check.code === "overlap")?.status,
    ).toBe("valid");
    expect(
      validateProject(next).find((check) => check.code === "walls")?.status,
    ).toBe("valid");
    expect(
      next.rooms.reduce((sum, room) => sum + room.netAreaM2, 0),
    ).toBeCloseTo(
      divided.rooms.reduce((sum, room) => sum + room.netAreaM2, 0),
      6,
    );
  });

  it("ridurre lo spessore mantiene le quote e restringe l'ingombro", () => {
    const project = rectangle();
    const before = project.rooms[0];
    const next = applyWallThicknessPreservingInterior(project, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.2,
    });
    expect(
      next.walls.every(
        (wall) =>
          wall.thickness === 0.2 && distance(wall.start, wall.end) > 0.05,
      ),
    ).toBe(true);
    expect(next.rooms[0].netAreaM2).toBeCloseTo(before.netAreaM2, 6);
    const previous = axisBox(project.walls),
      current = axisBox(next.walls);
    expect(current.minX).toBeCloseTo(previous.minX + 0.05, 6);
    expect(current.maxY).toBeCloseTo(previous.maxY - 0.05, 6);
  });

  it("una griglia di quattro ambienti resta in quota", () => {
    const project = rectangle();
    const floorId = project.floors[0].id;
    const divided = addWall(
      addWall(project, floorId, { x: 2, y: 0 }, { x: 2, y: 4.1 }),
      floorId,
      { x: 0, y: 2 },
      { x: 4.5, y: 2 },
    );
    expect(divided.rooms).toHaveLength(4);
    const previous = new Map(divided.rooms.map((room) => [room.id, room]));
    const next = applyWallThicknessPreservingInterior(divided, {
      internalWallThicknessM: 0.2,
      externalWallThicknessM: 0.4,
    });
    expect(next.rooms).toHaveLength(4);
    for (const room of next.rooms) {
      const old = previous.get(room.id);
      expect(old).toBeDefined();
      expect(area(room.polygon)).toBeCloseTo(area(old!.polygon), 6);
      expect(room.netAreaM2).toBeCloseTo(old!.netAreaM2, 6);
    }
    expect(
      validateProject(next).find((check) => check.code === "overlap")?.status,
    ).toBe("valid");
    expect(
      validateProject(next).find((check) => check.code === "closure")?.status,
    ).not.toBe("warning");
  });

  it("conserva la connessione di un lato diviso in segmenti collineari", () => {
    const project = rectangle();
    const split = splitWall(project, project.walls[0].id, 2.65);
    expect(split.walls).toHaveLength(5);
    const before = split.rooms[0];
    const next = applyWallThicknessPreservingInterior(split, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.4,
    });
    expect(next.walls).toHaveLength(5);
    expect(next.rooms).toHaveLength(1);
    expect(next.rooms[0].netAreaM2).toBeCloseTo(before.netAreaM2, 6);
    expect(
      validateProject(next).find((check) => check.code === "closure")?.status,
    ).not.toBe("warning");
  });

  it("non unisce i nodi di piani sovrapposti in pianta", () => {
    const project = rectangle();
    const first = project.floors[0];
    const upper = { ...first, id: crypto.randomUUID(), name: "Primo piano" };
    const stacked = addRectangle(
      { ...project, floors: [...project.floors, upper] },
      upper.id,
      { width: 4.2, length: 3.8, height: 2.7, name: "Camera" },
    );
    const before = new Map(
      stacked.rooms.map((room) => [room.id, area(room.polygon)] as const),
    );
    const next = applyWallThicknessPreservingInterior(stacked, {
      internalWallThicknessM: 0.1,
      externalWallThicknessM: 0.4,
    });
    expect(next.rooms).toHaveLength(2);
    for (const room of next.rooms) {
      const previous = before.get(room.id);
      expect(previous).toBeDefined();
      expect(area(room.polygon)).toBeCloseTo(previous!, 6);
    }
    for (const floor of next.floors) {
      expect(
        next.walls
          .filter((wall) => wall.floorId === floor.id)
          .every((wall) => wall.thickness === 0.4),
      ).toBe(true);
    }
  });

  it("una lunga fila di ambienti converge senza scostamenti", () => {
    const count = 20,
      step = 3,
      depth = 4;
    const empty = createProject(),
      floorId = empty.floors[0].id;
    const walls: Wall[] = [];
    for (let i = 0; i <= count; i++)
      walls.push({
        id: newId(),
        floorId,
        start: { x: i * step, y: 0 },
        end: { x: i * step, y: depth },
        thickness: i === 0 || i === count ? 0.3 : 0.1,
        type:
          i === 0 || i === count ? ("ESTERNO" as const) : ("INTERNO" as const),
        height: null,
        locked: false,
      });
    for (const y of [0, depth])
      walls.push({
        id: newId(),
        floorId,
        start: { x: 0, y },
        end: { x: count * step, y },
        thickness: 0.3,
        type: "ESTERNO" as const,
        height: null,
        locked: false,
      });
    const project = recomputeProject({ ...empty, walls });
    expect(project.rooms).toHaveLength(count);
    const before = new Map(
      project.rooms.map((room) => [room.id, area(room.polygon)]),
    );
    const next = applyWallThicknessPreservingInterior(project, {
      internalWallThicknessM: 0.2,
      externalWallThicknessM: 0.4,
    });
    expect(next.rooms).toHaveLength(count);
    for (const room of next.rooms)
      expect(area(room.polygon)).toBeCloseTo(before.get(room.id)!, 6);
  });

  it("rifiuta di spostare muri bloccati e spessori fuori scala", () => {
    const project = rectangle();
    const locked = {
      ...project,
      walls: project.walls.map((wall) => ({ ...wall, locked: true })),
    };
    expect(() =>
      applyWallThicknessPreservingInterior(locked, {
        internalWallThicknessM: 0.1,
        externalWallThicknessM: 0.4,
      }),
    ).toThrow(/Sbloccare/);
    expect(() =>
      applyWallThicknessPreservingInterior(project, {
        internalWallThicknessM: 0.1,
        externalWallThicknessM: 0,
      }),
    ).toThrow(/Spessore/);
  });
});
