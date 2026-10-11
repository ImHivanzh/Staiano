import { expect, it } from "vitest";
import { addRectangle, createProject } from "./project";
import { createInstallation, ensureInstallations } from "./installations";
import { applyDuctedSystem } from "./ducted/apply";
import { applyManualDuctedSystem, ductedRoomAllocation } from "./ducted/apply";
import { addOperatorTerminal } from "./air-terminals/operator";
import { guidedTerminalPoint } from "../../tests/guided-fixture";
import { validateProject } from "./validation";
import { applyRadiatorSolution } from "./radiators/apply";
import { sizeRadiators } from "./radiators/size";
import { radiatorProducts } from "./catalogs/radiators";
import {
  decodeProject,
  encodeProject,
  parseProject,
} from "@/services/project/format";

function fixture() {
  let project = createProject();
  for (const [index, name] of ["Soggiorno", "Camera", "Studio"].entries())
    project = addRectangle(project, project.floors[0].id, {
      width: 4,
      length: 4,
      height: 2.7,
      name,
      origin: { x: index * 6, y: 0 },
    });
  return project;
}

it("keeps a multi-room ducted installation and an independent radiator installation in the same room", () => {
  let project = fixture();
  const room = project.rooms[0];
  project = createInstallation(project, "ducted", room.id);
  const first = project.installations[0].id;
  project = applyDuctedSystem(
    project,
    project.rooms.slice(0, 2).map((item) => item.id),
    "Daikin",
    null,
    null,
    first,
  );
  const ducted = structuredClone(project.hvacSystems[0]);
  project = createInstallation(project, "radiator", room.id);
  const second = project.installations.at(-1)!;
  expect(second.roomIds).toEqual([room.id]);
  const solution = sizeRadiators(
    room.designLoadW,
    radiatorProducts.filter(
      (item) => item.manufacturer === "Global" && item.family === "VIP",
    ),
    50,
    { numberOfRadiators: 1, manufacturer: "Global", family: "VIP" },
  )[0];
  project = applyRadiatorSolution(project, room.id, solution, null, second.id);
  expect(project.hvacSystems[0]).toEqual(ducted);
  expect(
    project.radiators.every((item) => item.installationId === second.id),
  ).toBe(true);
  const restored = decodeProject(encodeProject(project));
  expect(
    restored.installations.map((item) => ({
      id: item.id,
      type: item.type,
      roomIds: item.roomIds,
    })),
  ).toEqual(
    project.installations.map((item) => ({
      id: item.id,
      type: item.type,
      roomIds: item.roomIds,
    })),
  );
  expect(restored.hvacSystems[0].installationId).toBe(first);
  expect(restored.radiators).toHaveLength(project.radiators.length);
  expect(() =>
    applyRadiatorSolution(project, room.id, solution, null, first),
  ).toThrow("un solo tipo");
});

it("does not replace radiators or change temperatures in a different installation", () => {
  let project = fixture();
  const room = project.rooms[0];
  const products = radiatorProducts.filter(
    (item) => item.manufacturer === "Global" && item.family === "VIP",
  );
  project = createInstallation(project, "radiator", room.id);
  const first = project.installations[0].id;
  project = applyRadiatorSolution(
    project,
    room.id,
    sizeRadiators(room.designLoadW, products, 50, {
      numberOfRadiators: 1,
      manufacturer: "Global",
      family: "VIP",
    })[0],
    null,
    first,
  );
  const original = structuredClone(project.radiators);
  project = createInstallation(project, "radiator", room.id);
  const second = project.installations.at(-1)!.id;
  project = applyRadiatorSolution(
    project,
    room.id,
    sizeRadiators(room.designLoadW, products, 60, {
      numberOfRadiators: 1,
      manufacturer: "Global",
      family: "VIP",
    })[0],
    null,
    second,
  );
  expect(
    project.radiators.filter((item) => item.installationId === first),
  ).toEqual(original);
  expect(project.radiators.some((item) => item.installationId === second)).toBe(
    true,
  );
  expect(
    validateProject(project)
      .filter((check) => check.code === "deltaT")
      .every((check) => check.status === "valid"),
  ).toBe(true);
});

it("isolates ports and operating flow for two ducted installations in the same room", () => {
  let project = fixture();
  const room = project.rooms[0];
  project = createInstallation(project, "ducted", room.id);
  const first = project.installations[0].id;
  project = applyManualDuctedSystem(
    project,
    [room.id],
    { manufacturer: "Manuale", model: "Impianto A", maxAirflowM3h: 300 },
    null,
    first,
  );
  const firstSystem = project.hvacSystems[0];
  project = createInstallation(project, "ducted", room.id);
  const second = project.installations.at(-1)!.id;
  project = applyManualDuctedSystem(
    project,
    [room.id],
    { manufacturer: "Manuale", model: "Impianto B", maxAirflowM3h: 500 },
    null,
    second,
  );
  const secondSystem = project.hvacSystems.find(
    (system) => system.installationId === second,
  )!;
  project = {
    ...project,
    installations: project.installations.map((item) =>
      item.id === second
        ? { ...item, roomAirPoints: { [room.id]: { supply: 2, return: 4 } } }
        : item,
    ),
  };
  expect(
    ductedRoomAllocation(project, room.id, first)?.supplyAirflowPerPointM3h,
  ).toBe(300);
  expect(
    ductedRoomAllocation(project, room.id, second)?.supplyAirflowPerPointM3h,
  ).toBe(250);
  expect(
    ductedRoomAllocation(project, room.id, second)?.returnAirflowPerPointM3h,
  ).toBe(125);
  const point = guidedTerminalPoint();
  for (const system of [firstSystem, secondSystem])
    project = addOperatorTerminal(project, {
      ...point,
      roomId: room.id,
      systemId: system.id,
      use: "supply",
      mounting: "ceiling",
      lengthMm: 1000,
    });
  expect(
    project.airTerminals.filter(
      (terminal) => terminal.systemId === firstSystem.id,
    ),
  ).toHaveLength(1);
  expect(
    project.airTerminals.filter(
      (terminal) => terminal.systemId === secondSystem.id,
    ),
  ).toHaveLength(1);
  expect(
    project.hvacSystems.find((system) => system.id === firstSystem.id)
      ?.genericMachine,
  ).toEqual(firstSystem.genericMachine);
  expect(project.rooms[0].supplyPoints).toBe(1);
});

it("migrates v4 physical equipment into stable independent installations without dropping devices", () => {
  let project = fixture();
  project = applyDuctedSystem(project, [project.rooms[0].id], "Daikin", null);
  const legacy = { ...project, schemaVersion: 4 } as Record<string, unknown>;
  delete legacy.installations;
  const migrated = parseProject(legacy);
  expect(migrated.schemaVersion).toBe(5);
  expect(migrated.hvacSystems[0].id).toBe(project.hvacSystems[0].id);
  expect(migrated.installations).toHaveLength(1);
  expect(ensureInstallations(migrated)).toEqual(migrated);
});
