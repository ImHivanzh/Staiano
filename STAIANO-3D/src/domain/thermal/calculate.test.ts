import { expect, it } from "vitest";
import { calculateThermal } from "./calculate";
import {
  addAdjacentRoom,
  addRectangle,
  createProject,
  recomputeProject,
} from "../project";
import { validateProject } from "../validation";
import { roomWallSpan } from "../geometry/placement";
import { useProjectStore } from "@/stores/project-store";

it("usa il coefficiente scelto senza arrotondare e mantiene 35 come valore iniziale", () => {
  expect(calculateThermal(20, 2.7)).toEqual({
    volumeM3: 54,
    designLoadW: 1890,
  });
  const result = calculateThermal(12.345, 2.678, 42.75);
  expect(result).toEqual({
    volumeM3: 12.345 * 2.678,
    designLoadW: 12.345 * 2.678 * 42.75,
  });
  for (const value of [0, -1, NaN, Infinity]) {
    expect(() => calculateThermal(20, 2.7, value)).toThrow(/coefficiente/);
    expect(() => createProject("Non valido", value)).toThrow(/coefficiente/);
  }
});

function fixture(coefficient = 42.75) {
  const project = createProject("Coefficiente scelto", coefficient);
  return addRectangle(project, project.floors[0].id, {
    width: 6,
    length: 5,
    height: 3,
    name: "Sala",
  });
}

it("applica il coefficiente anche alle nuove stanze adiacenti", () => {
  const project = fixture();
  const next = addAdjacentRoom(
    project,
    project.rooms[0].wallIds[0],
    3,
    "Camera",
    2.7,
  );
  expect(next.rooms).toHaveLength(2);
  for (const room of next.rooms)
    expect(room.designLoadW).toBe(room.volumeM3 * 42.75);
});

it.each(["standard", "ceiling", "roof", "band"])(
  "ricalcola e valida il volume netto con coefficiente diverso da 35: %s",
  (shape) => {
    const project = fixture(35),
      room = project.rooms[0];
    const wall = project.walls.find((item) => item.id === room.wallIds[0])!;
    if (shape === "ceiling") room.ceilingHeightM = 2.6;
    if (shape === "roof") room.roof = { ridgeWallId: wall.id, ridgeHeightM: 4 };
    if (shape === "band")
      room.ceilingBands = [
        {
          id: "band",
          name: "Fascia",
          wallId: wall.id,
          offsetM: 0,
          lengthM: roomWallSpan(room, wall)!.lengthM,
          depthM: 0.5,
          elevationM: 2.4,
        },
      ];
    const before = recomputeProject(project);
    const changed = recomputeProject({
      ...before,
      projectSettings: { ...before.projectSettings, coefficientWm3: 42.75 },
    });
    expect(changed.rooms[0].volumeM3).toBe(before.rooms[0].volumeM3);
    expect(changed.walls).toEqual(before.walls);
    expect(changed.rooms[0].designLoadW).toBe(
      changed.rooms[0].volumeM3 * 42.75,
    );
    expect(
      validateProject(changed)
        .filter((check) => check.code === "thermal")
        .map((check) => check.status),
    ).toEqual(["valid"]);
  },
);

it("ricalcola dal pannello impostazioni, supporta annulla e conserva le esclusioni", () => {
  const store = useProjectStore;
  const initial = fixture();
  store.getState().load(initial);
  store.getState().commit((project) => ({
    ...project,
    projectSettings: { ...project.projectSettings, coefficientWm3: 55.25 },
  }));
  expect(store.getState().error).toBeNull();
  expect(store.getState().project!.rooms[0].designLoadW).toBe(
    initial.rooms[0].volumeM3 * 55.25,
  );
  store.getState().undo();
  expect(store.getState().project!.projectSettings.coefficientWm3).toBe(42.75);
  expect(store.getState().project!.rooms[0].designLoadW).toBe(
    initial.rooms[0].designLoadW,
  );
  initial.rooms[0].conditioningExclusion = { reason: "Ripostiglio" };
  const excluded = recomputeProject(initial);
  expect(excluded.rooms[0].designLoadW).toBe(0);
  expect(
    validateProject(excluded).find((check) => check.code === "thermal")?.status,
  ).toBe("valid");
});
