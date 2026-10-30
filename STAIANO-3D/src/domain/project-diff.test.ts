import { expect, it } from "vitest";
import { compareProjects } from "./project-diff";
import { guidedProjectFixture } from "../../tests/guided-fixture";

it("elenca elementi aggiunti, tolti e modificati per elenco", () => {
  const before = guidedProjectFixture();
  const wall = before.walls[0];
  const after = {
    ...before,
    walls: [
      { ...wall, thickness: wall.thickness + 0.05 },
      ...before.walls.slice(2),
      { ...wall, id: "muro-nuovo" },
    ],
  };
  expect(compareProjects(before, after)).toEqual([
    {
      key: "walls",
      label: "Muri",
      added: 1,
      removed: before.walls.length > 1 ? 1 : 0,
      changed: 1,
    },
  ]);
});

it("non segnala nulla se i progetti sono uguali", () => {
  const project = guidedProjectFixture();
  expect(compareProjects(project, structuredClone(project))).toEqual([]);
});
