import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  guidedTerminalPoint,
} from "../../../tests/guided-fixture";
import { ensureInstallations } from "../installations";
import {
  placeDuctedDraft,
  configureMachineOnPlan,
  saveTerminalOnPlan,
} from "./graphic-installation";
import { applyManualDuctedSystem } from "./apply";
import { refreshDuctedBindings } from "./refresh";
import {
  configurationBlock,
  connectDraftOnPlan,
  connectedRoomIds,
  connectHydronicOnPlan,
  hydronicRoomIds,
  hydronicTargets,
} from "./plan-connections";
import { connectionSelection } from "@/configurator/viewer3d/connection-selection";
import { projectSchema, type Project } from "@/schemas/project";
import { movePlacedDevice } from "../geometry/move-device";

function fixture(): Project {
  let project = ensureInstallations(guidedProjectFixture());
  project = {
    ...project,
    hvacSystems: [],
    airTerminals: [],
    plenums: [],
    ducts: [],
  };
  const installation = project.installations.find((i) => i.type === "ducted")!;
  project = placeDuctedDraft(
    project,
    installation.id,
    project.rooms[0].id,
    { x: 2, y: 4 },
    "machine",
  );
  return placeDuctedDraft(
    project,
    installation.id,
    project.rooms[0].id,
    { x: 4, y: 2 },
    "terminal",
  );
}

it("connects drafts without a path in the drawn plan", () => {
  const project = fixture();
  const [machine, terminal] = project.ductedDrafts!;
  terminal.position = { x: 40, y: 2 };
  const connected = connectDraftOnPlan(project, terminal.id, machine.id);
  expect(configurationBlock(connected, machine.id)).toBeNull();
  expect(connectedRoomIds(connected, machine.id)).toEqual([terminal.roomId]);
});

it("blocks configuration until connected and preserves links through machine and vent configuration", () => {
  let project = fixture();
  const [machine, terminal] = project.ductedDrafts!;
  expect(configurationBlock(project, machine.id)).toMatch(/Collega/);
  expect(configurationBlock(project, terminal.id)).toMatch(/Collega/);
  expect(connectionSelection(project, machine.id, terminal.id)).toEqual(
    connectionSelection(project, terminal.id, machine.id),
  );
  project = connectDraftOnPlan(project, terminal.id, machine.id);
  expect(configurationBlock(project, machine.id)).toBeNull();
  expect(configurationBlock(project, terminal.id)).toBe(
    "Configura prima la macchina.",
  );
  expect(connectedRoomIds(project, machine.id)).toEqual([terminal.roomId]);
  project = applyManualDuctedSystem(
    project,
    [terminal.roomId],
    guidedProjectFixture().hvacSystems[0].genericMachine!,
    null,
    machine.installationId,
  );
  const systemId = project.hvacSystems.at(-1)!.id;
  project = configureMachineOnPlan(
    project,
    systemId,
    machine.roomId,
    machine.position,
    machine.id,
  );
  project = refreshDuctedBindings(projectSchema.parse(project));
  expect(configurationBlock(project, terminal.id)).toBeNull();
  expect(project.hvacSystems.at(-1)!.roomIds).toEqual([terminal.roomId]);
  project = saveTerminalOnPlan(
    project,
    {
      ...guidedTerminalPoint(),
      color: "RAL9016",
      roomId: terminal.roomId,
      installationId: machine.installationId,
      systemId,
      use: "supply",
      mounting: "ceiling",
      lengthMm: 1000,
    },
    terminal.position,
    undefined,
    terminal.id,
  );
  expect(project.airTerminals.at(-1)!.systemId).toBe(systemId);
  expect(project.ductedDrafts).toHaveLength(0);
  expect(projectSchema.safeParse(project).success).toBe(true);
});

it("links a heat pump to a ducted indoor draft and retains its served rooms while moving and configuring", () => {
  let project = fixture();
  const [machine, terminal] = project.ductedDrafts!;
  const pump = {
    id: crypto.randomUUID(),
    floorId: machine.floorId,
    position: { x: -2, y: 3 },
  };
  project.heatPumpDrafts = [pump];
  expect(configurationBlock(project, pump.id)).toMatch(/Collega/);
  project = connectHydronicOnPlan(project, machine.id, pump.id);
  expect(configurationBlock(project, pump.id)).toMatch(/bocchette/);
  project = connectDraftOnPlan(project, terminal.id, machine.id);
  expect(hydronicRoomIds(project, pump.id)).toEqual([terminal.roomId]);
  expect(configurationBlock(project, pump.id)).toBeNull();
  expect(connectionSelection(project, machine.id, pump.id)?.hydronic).toBe(
    true,
  );
  project = movePlacedDevice(project, pump.id, { x: -3, y: 3 });
  expect(hydronicTargets(project, pump.id).map((t) => t.id)).toEqual([
    machine.id,
  ]);
  project = applyManualDuctedSystem(
    project,
    [terminal.roomId],
    guidedProjectFixture().hvacSystems[0].genericMachine!,
    null,
    machine.installationId,
  );
  project = configureMachineOnPlan(
    project,
    project.hvacSystems.at(-1)!.id,
    machine.roomId,
    machine.position,
    machine.id,
  );
  expect(hydronicTargets(project, pump.id)[0].id).toBe(
    project.hvacSystems.at(-1)!.indoorUnits[0].id,
  );
  expect(hydronicRoomIds(project, pump.id)).toEqual([terminal.roomId]);
  expect(projectSchema.safeParse(project).success).toBe(true);
});

it("keeps a terminal that needs reconfiguration reachable before it is connected", () => {
  let project = ensureInstallations(guidedProjectFixture());
  const system = project.hvacSystems[0];
  project = saveTerminalOnPlan(
    project,
    {
      ...guidedTerminalPoint(),
      color: "RAL9016",
      roomId: project.rooms[0].id,
      installationId: system.installationId,
      systemId: system.id,
      use: "supply",
      mounting: "ceiling",
      lengthMm: 1000,
    },
    { x: 4, y: 2 },
  );
  const id = project.airTerminals.at(-1)!.id;
  project = {
    ...project,
    airTerminals: project.airTerminals.map((t) =>
      t.id === id ? { ...t, systemId: null, pendingMachineId: undefined } : t,
    ),
  };
  expect(configurationBlock(project, id)).toMatch(/Collega prima la bocchetta/);
  // Connecting it fails until it is reconfigured, so it must be configurable.
  project = {
    ...project,
    airTerminals: project.airTerminals.map((t) =>
      t.id === id ? { ...t, legacyUnverified: true } : t,
    ),
  };
  expect(configurationBlock(project, id)).toBeNull();
});

it("rejects missing targets and connections across floors", () => {
  const project = fixture();
  const [machine, terminal] = project.ductedDrafts!;
  expect(() => connectDraftOnPlan(project, terminal.id, "missing")).toThrow();
  expect(() =>
    connectHydronicOnPlan(project, terminal.id, "missing"),
  ).toThrow();
  terminal.floorId = "other-floor";
  expect(() => connectDraftOnPlan(project, terminal.id, machine.id)).toThrow(
    /stesso piano/,
  );
});

it("reuses an existing configured vent when linking a new unconfigured machine", () => {
  let project = ensureInstallations(guidedProjectFixture());
  const old = project.hvacSystems[0];
  project = saveTerminalOnPlan(
    project,
    {
      ...guidedTerminalPoint(),
      color: "RAL9016",
      roomId: project.rooms[0].id,
      installationId: old.installationId,
      systemId: old.id,
      use: "supply",
      mounting: "ceiling",
      lengthMm: 1000,
    },
    { x: 4, y: 2 },
  );
  const terminal = project.airTerminals.at(-1)!;
  project = placeDuctedDraft(
    project,
    old.installationId!,
    project.rooms[0].id,
    { x: 2, y: 4 },
    "machine",
  );
  const draft = project.ductedDrafts!.at(-1)!;
  expect(connectionSelection(project, terminal.id, draft.id)?.systemId).toBe(
    draft.id,
  );
  project = connectDraftOnPlan(project, terminal.id, draft.id);
  expect(configurationBlock(project, draft.id)).toBeNull();
  expect(project.airTerminals.at(-1)!.productId).toBe(terminal.productId);
  project = applyManualDuctedSystem(
    project,
    [terminal.roomId],
    old.genericMachine!,
    null,
    draft.installationId,
  );
  const id = project.hvacSystems.at(-1)!.id;
  project = configureMachineOnPlan(
    project,
    id,
    draft.roomId,
    draft.position,
    draft.id,
  );
  expect(project.airTerminals.at(-1)!.systemId).toBe(id);
  expect(project.airTerminals.at(-1)!.pendingMachineId).toBeUndefined();
  expect(projectSchema.safeParse(project).success).toBe(true);
});
