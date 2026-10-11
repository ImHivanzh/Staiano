import { expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { applyDuctedSystem } from "./apply";
import { selectDuctedMachine } from "./calculate";
import { refreshDuctedBindings } from "./refresh";
import { decodeProject, encodeProject } from "@/services/project/format";

it("keeps an explicitly selected compatible machine after refresh and reload", () => {
  let project = createProject();
  project = addRectangle(project, project.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    name: "Camera",
  });
  const room = project.rooms[0];
  const candidates = selectDuctedMachine(
    room.designLoadW,
    "Daikin",
    hvacCatalog.products,
  );
  expect(candidates.length).toBeGreaterThan(1);
  project = applyDuctedSystem(project, [room.id], "Daikin", null);
  const id = project.hvacSystems[0].id;
  const chosen = candidates.at(-1)!;
  project = applyDuctedSystem(project, [room.id], "Daikin", id, chosen.id);
  project = decodeProject(encodeProject(refreshDuctedBindings(project)));
  expect(project.hvacSystems[0]).toMatchObject({
    id,
    productId: chosen.id,
    airflowM3h: maximumAirflowOption(chosen)!.airflowM3h,
    decisionOrigin: "confirmed",
  });
  expect(() =>
    applyDuctedSystem(project, [room.id], "Gree", id, chosen.id),
  ).toThrow("non è compatibile");
  expect(() =>
    applyDuctedSystem(project, [room.id], "Daikin", id, "missing"),
  ).toThrow("non è compatibile");
  expect(project.hvacSystems[0].productId).toBe(chosen.id);
});
