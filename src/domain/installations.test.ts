import { expect, it } from "vitest";
import { addRectangle, createProject } from "./project";
import {
  createInstallation,
  ensureInstallations,
  removeInstallation,
} from "./installations";
import { applyDuctedSystem } from "./ducted/apply";
import { applyManualDuctedSystem, ductedRoomAllocation } from "./ducted/apply";
import { addOperatorTerminal } from "./air-terminals/operator";
import {
  guidedTerminalPoint,
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../tests/guided-fixture";
import { projectSchema } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { applyFanCoil } from "./fan-coils/apply";
import { applyHydronicSystem } from "./hydronic/apply";
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
  expect(migrated.schemaVersion).toBe(6);
  expect(migrated.hvacSystems[0].id).toBe(project.hvacSystems[0].id);
  expect(migrated.installations).toHaveLength(1);
  expect(ensureInstallations(migrated)).toEqual(migrated);
});

it("deletes an accidental empty installation without changing another installation in the room", () => {
  const original = ensureInstallations(guidedProjectFixture());
  const added = createInstallation(original, "radiator", original.rooms[0].id);
  const removed = removeInstallation(added, added.installations.at(-1)!.id);
  expect(removed).toEqual(original);
  expect(removeInstallation(original, "missing")).toBe(original);
});

it("deletes a ducted installation and its terminals, plenum and ducts, preserving the other machine; undo restores everything", () => {
  let project = ensureInstallations(
    addGuidedTerminal(guidedProjectFixture(), 1000),
  );
  const firstId = project.installations[0].id;
  const firstSystemId = project.hvacSystems[0].id;
  const firstPlenum = {
    id: crypto.randomUUID(),
    systemId: firstSystemId,
    floorId: project.floors[0].id,
    roomId: project.rooms[0].id,
    position: { x: 2, y: 2 },
    rotation: 0,
    widthMm: 800,
    heightMm: 200,
    depthMm: 400,
    status: "manual" as const,
    locked: false,
    designSettings: null,
  };
  project.plenums = [firstPlenum];
  project.ducts = [
    {
      id: crypto.randomUUID(),
      systemId: firstSystemId,
      plenumId: firstPlenum.id,
      terminalId: null,
      branchId: null,
      shape: "circle",
      diameterMm: 100,
      widthMm: null,
      heightMm: null,
      routing: "manual",
      waypoints: [
        { x: 1, y: 1, elevationM: 2 },
        { x: 2, y: 1, elevationM: 2 },
      ],
      decisionOrigin: "manual",
      locked: false,
    },
  ];
  project = createInstallation(project, "ducted", project.rooms[0].id);
  const secondId = project.installations.at(-1)!.id;
  project = applyManualDuctedSystem(
    project,
    [project.rooms[0].id],
    {
      manufacturer: "Manuale",
      model: "Altra macchina",
      maxAirflowM3h: 300,
    },
    null,
    secondId,
  );
  project = addGuidedTerminal(project, 1000, "EDLS", "ceiling", 1);
  const original = structuredClone(project);
  const removed = removeInstallation(project, firstId);
  expect(removed.installations.map((item) => item.id)).toEqual([secondId]);
  expect(removed.hvacSystems).toEqual(
    original.hvacSystems.filter((item) => item.installationId === secondId),
  );
  expect(removed.airTerminals).toEqual(
    original.airTerminals.filter((item) => item.systemId !== firstSystemId),
  );
  expect(removed.plenums).toEqual(
    original.plenums.filter((item) => item.systemId !== firstSystemId),
  );
  expect(removed.ducts).toEqual([]);
  expect(removed.rooms).toEqual(original.rooms);
  expect(project).toEqual(original);
  expect(() => projectSchema.parse(removed)).not.toThrow();
  expect(ensureInstallations(removed).installations).toEqual(
    removed.installations,
  );
  useProjectStore.getState().load(project);
  const loaded = structuredClone(useProjectStore.getState().project!);
  useProjectStore
    .getState()
    .commit((current) => removeInstallation(current, firstId));
  expect(useProjectStore.getState().error).toBeNull();
  expect(useProjectStore.getState().project!.installations).toHaveLength(1);
  useProjectStore.getState().undo();
  expect(useProjectStore.getState().project).toMatchObject({
    ...loaded,
    updatedAt: expect.any(String),
  });
  project.airTerminals[0].locked = true;
  useProjectStore.getState().load(project);
  useProjectStore
    .getState()
    .commit((current) => removeInstallation(current, firstId));
  expect(useProjectStore.getState().error).toContain("Sbloccare");
  expect(useProjectStore.getState().project!.installations).toHaveLength(2);
});

it("deletes only the selected radiator installation and resets the room when the last one is removed", () => {
  let project = fixture();
  const room = project.rooms[0];
  const solution = sizeRadiators(
    room.designLoadW,
    radiatorProducts.filter(
      (item) => item.manufacturer === "Global" && item.family === "VIP",
    ),
    50,
    {
      numberOfRadiators: 1,
      manufacturer: "Global",
      family: "VIP",
    },
  )[0];
  for (let i = 0; i < 2; i++) {
    project = createInstallation(project, "radiator", room.id);
    project = applyRadiatorSolution(
      project,
      room.id,
      solution,
      null,
      project.installations.at(-1)!.id,
    );
  }
  const removed = removeInstallation(project, project.installations[0].id);
  expect(removed.radiators).toEqual(
    project.radiators.filter(
      (item) => item.installationId === project.installations[1].id,
    ),
  );
  expect(removed.rooms[0].systemType).toBe("radiator");
  const empty = removeInstallation(removed, removed.installations[0].id);
  expect(empty.radiators).toHaveLength(0);
  expect(empty.rooms[0].systemType).toBe("none");
  expect(decodeProject(encodeProject(empty)).installations).toHaveLength(0);
});

it("adds separate radiator points covering part of the room load without replacing the first point", () => {
  let project = ensureInstallations(guidedProjectFixture());
  const room = project.rooms[0];
  project = createInstallation(project, "radiator", room.id);
  const installationId = project.installations.at(-1)!.id;
  const solution = sizeRadiators(
    1800,
    radiatorProducts.filter(
      (item) => item.manufacturer === "Global" && item.family === "VIP",
    ),
    50,
    { numberOfRadiators: 1, manufacturer: "Global", family: "VIP" },
  )[0];
  project = applyRadiatorSolution(
    project,
    room.id,
    solution,
    null,
    installationId,
    true,
  );
  const first = structuredClone(project.radiators[0]);
  project = applyRadiatorSolution(
    project,
    room.id,
    solution,
    null,
    installationId,
    true,
  );
  expect(project.radiators).toHaveLength(2);
  expect(project.radiators[0]).toEqual(first);
  expect(project.radiators[1].position).not.toEqual(first.position);
  expect(
    project.radiators.reduce((sum, unit) => sum + unit.outputW, 0),
  ).toBeGreaterThanOrEqual(3600);
  expect(() => projectSchema.parse(project)).not.toThrow();
});

it("deletes fan coils and their hydronic references without deleting the shared heat pump", () => {
  let project = fixture();
  for (const room of project.rooms.slice(0, 2)) {
    project = createInstallation(project, "fanCoil", room.id);
    project = applyFanCoil(project, room.id, "innova-airleaf-sl-400-2t", 0, {
      installationId: project.installations.at(-1)!.id,
    });
  }
  project = applyHydronicSystem(project, {
    productId: "gree-versati-v-8-monofase",
    roomIds: project.rooms.slice(0, 2).map((room) => room.id),
    fanCoilIds: project.fanCoils!.map((device) => device.id),
    operatingPointIndex: 1,
  });
  project.hydronicSystems![0].pipeWaypoints = project.fanCoils!.map(
    (device) => ({
      fanCoilId: device.id,
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    }),
  );
  const remainingCoil = project.fanCoils![1];
  const removed = removeInstallation(project, project.installations[0].id);
  expect(removed.fanCoils).toEqual([remainingCoil]);
  expect(removed.hydronicSystems![0]).toMatchObject({
    fanCoilIds: [remainingCoil.id],
    outdoorUnit: project.hydronicSystems![0].outdoorUnit,
  });
  expect(removed.hydronicSystems![0].pipeWaypoints).toHaveLength(1);
  expect(removed.rooms[0].systemType).toBe("none");
  expect(() => projectSchema.parse(removed)).not.toThrow();
});
