import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  guidedTerminalPoint,
} from "../../../tests/guided-fixture";
import {
  createInstallation,
  ensureInstallations,
  removeInstallation,
} from "../installations";
import { applyManualDuctedSystem } from "./apply";
import {
  connectTerminalOnPlan,
  placeMachineOnPlan,
  saveTerminalOnPlan,
  moveDuctedDraft,
  placeDuctedDraft,
} from "./graphic-installation";
import { terminalAirflowBalance } from "../air-terminals/airflow-balance";
import { decodeProject, encodeProject } from "@/services/project/format";
import { projectSchema, type Project } from "@/schemas/project";
import { addRectangle, addWall } from "../project";
import { linearRunMembers } from "../air-terminals/linear-run";
import { duplicateSelection } from "../geometry/selection";
import { validateProject } from "../validation";
import { calculateEcoclimaBom } from "../air-terminals/commercial-bom";
import { airConnectionRoutes, routeBelowTerminals } from "./routes";
import { translateSelection, removeSelection } from "../geometry/selection";
import { movePlacedDevice } from "../geometry/move-device";
import { refreshDuctedBindings } from "./refresh";

function fixture() {
  let project = ensureInstallations(guidedProjectFixture());
  const system = project.hvacSystems[0];
  project = applyManualDuctedSystem(
    project,
    system.roomIds,
    { ...system.genericMachine!, maxAirflowM3h: 900 },
    system.id,
    system.installationId,
  );
  return placeMachineOnPlan(project, system.id, project.rooms[0].id, {
    x: 2,
    y: 4,
  });
}
function input(project: Project, lengths = [1000]) {
  return {
    ...guidedTerminalPoint(),
    color: "RAL9016",
    roomId: project.rooms[0].id,
    systemId: project.hvacSystems[0].id,
    use: "supply" as const,
    mounting: "ceiling" as const,
    lengthMm: lengths.reduce((sum, length) => sum + length, 0),
    ...(lengths.length > 1 ? { moduleLengthsMm: lengths } : {}),
  };
}

it("derives rooms from connections, clears them after disconnect and preserves the unconnected machine on save and deletion", () => {
  let project = refreshDuctedBindings(fixture());
  const machineId = project.hvacSystems[0].indoorUnits[0].id;
  expect(project.hvacSystems[0].roomIds).toEqual([]);
  project = saveTerminalOnPlan(project, input(project), { x: 4, y: 2 });
  expect(project.hvacSystems[0].roomIds).toEqual([]);
  project = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    project.hvacSystems[0].id,
  );
  expect(project.hvacSystems[0].roomIds).toEqual([project.rooms[0].id]);
  expect(project.rooms[0].systemType).toBe("ducted");
  project = connectTerminalOnPlan(project, project.airTerminals[0].id, null);
  expect(project.hvacSystems[0].roomIds).toEqual([]);
  expect(project.rooms[0].systemType).toBe("none");
  project = decodeProject(encodeProject(project));
  expect(project.hvacSystems[0].indoorUnits[0].id).toBe(machineId);
  expect(project.airTerminals[0].pendingSystemId).toBe(
    project.hvacSystems[0].id,
  );
  project = removeSelection(project, [
    { kind: "device", id: project.airTerminals[0].id },
  ]);
  expect(project.hvacSystems[0].indoorUnits[0].id).toBe(machineId);
});

it("connects a terminal in a new room without selecting served rooms beforehand", () => {
  let project = fixture();
  project = addWall(
    project,
    project.floors[0].id,
    { x: 4, y: 0 },
    { x: 4, y: Math.max(...project.walls.map((wall) => wall.end.y)) },
  );
  const targetRoom = project.rooms.find((room) => room.centroid.x > 4)!;
  project = saveTerminalOnPlan(
    project,
    {
      ...input(project),
      roomId: targetRoom.id,
    },
    { x: 6, y: 2 },
  );
  const systemId = project.hvacSystems[0].id;
  const connected = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    systemId,
  );
  expect(connected.hvacSystems[0].roomIds).toEqual([targetRoom.id]);
  expect(connected.hvacSystems[0].indoorUnits[0].roomId).not.toBe(
    targetRoom.id,
  );
  expect(connected.installations[0].roomIds).toContain(targetRoom.id);
  expect(connected.airTerminals[0].requiredAirflowM3h).toBe(900);
  expect(() => decodeProject(encodeProject(connected))).not.toThrow();
});

it("connects configured devices across an undrawn gap while retaining floor checks and save compatibility", () => {
  let p = fixture();
  p = addRectangle(p, p.floors[0].id, {
    width: 6,
    length: 5,
    height: 2.7,
    name: "Stanza separata",
    origin: { x: 20, y: 0 },
  });
  const room = p.rooms.find((r) => r.centroid.x > 20)!;
  p = saveTerminalOnPlan(
    p,
    { ...input(p), roomId: room.id, plenumOptions: { insulatedPlenum: true } },
    room.centroid,
  );
  const terminalId = p.airTerminals.at(-1)!.id;
  const connected = connectTerminalOnPlan(p, terminalId, p.hvacSystems[0].id);
  expect(
    connected.airTerminals.find((t) => t.id === terminalId)?.systemId,
  ).toBe(p.hvacSystems[0].id);
  // Association and saving work across an undrawn gap; a physical hose must not cross outdoors.
  expect(airConnectionRoutes(connected, p.floors[0].id)[0].points).toEqual([]);
  expect(() => decodeProject(encodeProject(connected))).not.toThrow();
  p.airTerminals.at(-1)!.floorId = "another-floor";
  expect(() =>
    connectTerminalOnPlan(p, terminalId, p.hvacSystems[0].id),
  ).toThrow(/stesso piano/);
});

it("shows graphical connections in 3D along the same plan route without changing project data", () => {
  const base = fixture();
  const saved = saveTerminalOnPlan(
    base,
    { ...input(base), plenumOptions: { insulatedPlenum: true } },
    { x: 4, y: 2 },
  );
  const terminalId = saved.airTerminals[0].id;
  const connected = connectTerminalOnPlan(
    saved,
    terminalId,
    saved.hvacSystems[0].id,
  );
  const before = JSON.stringify(connected);
  const [connection] = airConnectionRoutes(connected, connected.floors[0].id);
  const terminal = connected.airTerminals[0];
  const machine = connected.hvacSystems[0].indoorUnits[0];
  const start = connection.points[0];
  expect(
    (start.y - machine.position.y) * Math.cos(machine.rotation) -
      (start.x - machine.position.x) * Math.sin(machine.rotation),
  ).toBeGreaterThan(machine.depthMm / 2000);
  expect(connection.points.at(-1)!.elevationM).toBeGreaterThan(
    terminal.elevationM!,
  );
  expect(connection.diameterMm).toBeGreaterThan(70);
  expect(
    connection.points.every((point) => Number.isFinite(point.elevationM)),
  ).toBe(true);
  expect(airConnectionRoutes(connected, "other-floor")).toEqual([]);
  expect(
    airConnectionRoutes(
      connectTerminalOnPlan(connected, terminalId, null),
      connected.floors[0].id,
    ),
  ).toEqual([]);
  expect(JSON.stringify(connected)).toBe(before);
});

it.each([0, Math.PI / 4, Math.PI / 2])(
  "passes below a crossed terminal at rotation %s while preserving endpoint heights",
  (rotation) => {
    const base = fixture();
    const saved = saveTerminalOnPlan(base, input(base), { x: 4, y: 2 });
    const obstacle = {
      ...saved.airTerminals[0],
      rotation,
      position: { x: 4, y: 3 },
      elevationM: 2.6,
    };
    const project = { ...saved, airTerminals: [obstacle] };
    const points = [
      { x: 2, y: 3, elevationM: 2.7 },
      { x: 6, y: 3, elevationM: 2.7 },
    ];
    const before = JSON.stringify(project);
    const route = routeBelowTerminals(
      project,
      obstacle.floorId,
      points,
      [],
      0.035,
    );
    expect(route[0]).toEqual(points[0]);
    expect(route.at(-1)).toEqual(points.at(-1));
    expect(
      route
        .slice(1, -1)
        .every(
          (point) =>
            point.elevationM + 0.035 <= obstacle.elevationM - 0.02 + 1e-9,
        ),
    ).toBe(true);
    expect(route.slice(1, -1).map(({ x, y }) => ({ x, y }))).toEqual(
      points.map(({ x, y }) => ({ x, y })),
    );
    expect(
      routeBelowTerminals(
        project,
        obstacle.floorId,
        points,
        [obstacle.id],
        0.035,
      ),
    ).toBe(points);
    expect(routeBelowTerminals(project, "other-floor", points, [], 0.035)).toBe(
      points,
    );
    const below = points.map((point) => ({ ...point, elevationM: 2.4 }));
    expect(
      routeBelowTerminals(project, obstacle.floorId, below, [], 0.035),
    ).toBe(below);
    const distant = points.map((point) => ({ ...point, y: 5 }));
    expect(
      routeBelowTerminals(project, obstacle.floorId, distant, [], 0.035),
    ).toBe(distant);
    expect(JSON.stringify(project)).toBe(before);
  },
);

it("saves wall terminals and independent plenum choices through edits and export", () => {
  const base = fixture();
  const plenumOptions = {
    insulatedPlenum: false,
    plenumMaterial: "galvanized" as const,
    plenumShape: "trapezoidal" as const,
    connectionPosition: "custom" as const,
    connectionNote: "Due stacchi sul lato destro",
  };
  const saved = saveTerminalOnPlan(
    base,
    {
      ...input(base),
      mounting: "wall",
      plenumOptions,
    },
    { x: 4, y: 0 },
  );
  const first = saved.airTerminals[0];
  expect(first.mounting).toBe("wall");
  expect(first.wallId).not.toBeNull();
  expect(first.elevationM).toBeLessThan(base.rooms[0].heightM);
  const two = saveTerminalOnPlan(
    saved,
    {
      ...input(saved),
      plenumOptions: { insulatedPlenum: true, connectionPosition: "upper" },
    },
    { x: 4, y: 2 },
  );
  const edited = saveTerminalOnPlan(
    two,
    {
      ...input(two, [2000]),
      mounting: "wall",
      plenumOptions,
    },
    first.position,
    first.id,
  );
  const restored = decodeProject(encodeProject(edited));
  expect(restored.airTerminals[0].commercialOptions).toMatchObject(
    plenumOptions,
  );
  expect(restored.airTerminals[1].commercialOptions).toMatchObject({
    insulatedPlenum: true,
    connectionPosition: "upper",
  });
  expect(restored.airTerminals[1].commercialOptions?.plenumMaterial).not.toBe(
    "galvanized",
  );
  expect(() =>
    saveTerminalOnPlan(
      base,
      {
        ...input(base),
        plenumOptions: { ...plenumOptions, connectionNote: "x".repeat(201) },
      },
      { x: 4, y: 2 },
    ),
  ).toThrow();
});

it("requires an explicit terminal color before saving", () => {
  const base = fixture();
  for (const color of [undefined, "", "   "])
    expect(() =>
      saveTerminalOnPlan(base, { ...input(base), color }, { x: 4, y: 2 }),
    ).toThrow("Scegli il colore");
  const saved = saveTerminalOnPlan(base, input(base), { x: 4, y: 2 });
  expect(saved.airTerminals.at(-1)?.color).toBe("RAL9016");
});

it("saves explicitly requested custom lengths without assigning a catalogue price", () => {
  const base = fixture();
  const custom = { ...input(base, [1100]), customLength: true };
  expect(() =>
    saveTerminalOnPlan(
      base,
      { ...custom, customLength: false },
      { x: 4, y: 2 },
    ),
  ).toThrow("catalogo");
  const saved = saveTerminalOnPlan(base, custom, { x: 4, y: 2 });
  const restored = decodeProject(encodeProject(saved));
  expect(restored.airTerminals.at(-1)?.widthMm).toBe(1100);
  const line = calculateEcoclimaBom(restored).lines.find(
    (item) => item.kind === "terminal",
  );
  expect(line?.unitPriceCents).toBeNull();
  expect(line?.reason).toContain("quotazione a Ecoclima");
  for (const lengthMm of [0, -1, NaN, 10001])
    expect(() =>
      saveTerminalOnPlan(base, { ...custom, lengthMm }, { x: 4, y: 2 }),
    ).toThrow();
  expect(() =>
    saveTerminalOnPlan(
      base,
      { ...input(base, [1100, 1000]), customLength: true },
      { x: 4, y: 2 },
    ),
  ).toThrow("catalogo");
});

it("persists incomplete machines and terminals without model data or calculation entries, and opens v5 projects", () => {
  const base = fixture();
  const legacy = { ...base, schemaVersion: 5 };
  const restoredLegacy = decodeProject(JSON.stringify(legacy));
  expect(restoredLegacy.hvacSystems).toEqual(
    base.hvacSystems.map((system) => ({ ...system, roomIds: [] })),
  );
  const empty = { ...base, hvacSystems: [], airTerminals: [] };
  let project = placeDuctedDraft(
    empty,
    base.installations[0].id,
    base.rooms[0].id,
    { x: 4, y: 2 },
    "terminal",
  );
  project = placeDuctedDraft(
    project,
    base.installations[0].id,
    base.rooms[0].id,
    { x: 2, y: 4 },
    "machine",
  );
  const restored = decodeProject(encodeProject(project));
  expect(restored.ductedDrafts).toEqual(project.ductedDrafts);
  expect(restored.hvacSystems).toHaveLength(0);
  expect(restored.airTerminals).toHaveLength(0);
  expect(
    validateProject(restored).filter(
      (item) => item.code === "ducted-incomplete",
    ),
  ).toHaveLength(2);
  expect(calculateEcoclimaBom(restored).lines).toHaveLength(0);
  expect(
    removeInstallation(restored, base.installations[0].id).ductedDrafts,
  ).toEqual([]);
  expect(() =>
    placeDuctedDraft(
      empty,
      base.installations[0].id,
      base.rooms[0].id,
      { x: NaN, y: 2 },
      "terminal",
    ),
  ).toThrow();
  expect(() =>
    projectSchema.parse({
      ...restored,
      ductedDrafts: [{ ...project.ductedDrafts[0], installationId: "missing" }],
    }),
  ).toThrow();
});

it("configures a terminal before any machine without assigning one; catalog options are enforced", () => {
  const base = fixture();
  const empty = { ...base, hvacSystems: [] };
  const draft = placeDuctedDraft(
    empty,
    base.installations[0].id,
    base.rooms[0].id,
    { x: 4, y: 2 },
    "terminal",
  );
  const independent = {
    ...input(base),
    systemId: null,
    installationId: base.installations[0].id,
  };
  const saved = saveTerminalOnPlan(
    draft,
    independent,
    { x: 4, y: 2 },
    undefined,
    draft.ductedDrafts[0].id,
  );
  expect(saved.ductedDrafts).toEqual([]);
  expect(saved.airTerminals[0]).toMatchObject({
    systemId: null,
    requiredAirflowM3h: 0,
    installationId: base.installations[0].id,
  });
  expect(saved.airTerminals[0].pendingSystemId).toBeUndefined();
  expect(decodeProject(encodeProject(saved)).airTerminals).toEqual(
    saved.airTerminals,
  );
  expect(() =>
    saveTerminalOnPlan(
      draft,
      { ...independent, color: "inesistente" },
      { x: 4, y: 2 },
    ),
  ).toThrow("catalogo");
  expect(() =>
    saveTerminalOnPlan(
      draft,
      { ...independent, lengthMm: 999 },
      { x: 4, y: 2 },
    ),
  ).toThrow("catalogo");
  expect(() =>
    connectTerminalOnPlan(saved, saved.airTerminals[0].id, "missing"),
  ).toThrow();
});

it("moves and copies incomplete room contents, and removes them with the room", () => {
  const base = fixture();
  const project = placeDuctedDraft(
    { ...base, hvacSystems: [] },
    base.installations[0].id,
    base.rooms[0].id,
    { x: 4, y: 2 },
    "terminal",
  );
  const selection = [{ kind: "room" as const, id: base.rooms[0].id }];
  const moved = translateSelection(project, selection, { x: 12, y: 0 });
  expect(moved.ductedDrafts?.[0].position).toEqual({ x: 16, y: 2 });
  const copied = duplicateSelection(project, selection, { x: 12, y: 0 });
  expect(copied.ductedDrafts).toHaveLength(2);
  expect(copied.ductedDrafts?.[1].id).not.toBe(project.ductedDrafts[0].id);
  expect(() => projectSchema.parse(copied)).not.toThrow();
  expect(removeSelection(project, selection).ductedDrafts).toEqual([]);
});

it("keeps terminal identity, elevation and accessories when editing catalog length", () => {
  const base = fixture();
  const saved = saveTerminalOnPlan(base, input(base), { x: 4, y: 2 });
  const before = {
    ...saved.airTerminals[0],
    productCode: "Codice storico",
    elevationM: base.rooms[0].heightM,
    commercialOptions: {
      insulatedPlenum: false,
      fixingBridges: false,
      continuityKit: false,
    },
  };
  const changed = saveTerminalOnPlan(
    { ...saved, airTerminals: [before] },
    input(saved, [2000]),
    { x: 4, y: 2 },
    before.id,
  );
  expect(changed.airTerminals[0]).toMatchObject({
    id: before.id,
    elevationM: base.rooms[0].heightM,
    productCode: "Codice storico",
    widthMm: 2000,
    commercialOptions: {
      insulatedPlenum: false,
      fixingBridges: false,
      continuityKit: false,
    },
  });
});

it("saves an unconnected 2+1 point, its intended machine and modules without consuming flow", () => {
  const original = fixture();
  const project = saveTerminalOnPlan(original, input(original, [2000, 1000]), {
    x: 4,
    y: 2,
  });
  expect(original.airTerminals).toHaveLength(0);
  expect(project.airTerminals.map((terminal) => terminal.widthMm)).toEqual([
    2000, 1000,
  ]);
  expect(
    project.airTerminals.every(
      (terminal) =>
        terminal.systemId === null &&
        terminal.pendingSystemId === project.hvacSystems[0].id,
    ),
  ).toBe(true);
  expect(
    terminalAirflowBalance(project, project.hvacSystems[0].id, "supply")
      .remaining,
  ).toBe(900);
  const restored = decodeProject(encodeProject(project));
  expect(restored.airTerminals).toEqual(project.airTerminals);
  const connected = connectTerminalOnPlan(
    restored,
    restored.airTerminals[1].id,
    restored.hvacSystems[0].id,
  );
  const capacity = connected.airTerminals.reduce(
    (sum, terminal) => sum + terminal.availableAirflowM3h,
    0,
  );
  expect(
    connected.airTerminals.every(
      (terminal) =>
        terminal.systemId === project.hvacSystems[0].id &&
        !terminal.pendingSystemId,
    ),
  ).toBe(true);
  expect(
    terminalAirflowBalance(connected, project.hvacSystems[0].id, "supply")
      .remaining,
  ).toBe(Math.max(0, 900 - capacity));
  const disconnected = connectTerminalOnPlan(
    connected,
    connected.airTerminals[0].id,
    null,
  );
  expect(
    disconnected.airTerminals.every(
      (terminal) => terminal.pendingSystemId === project.hvacSystems[0].id,
    ),
  ).toBe(true);
  expect(
    terminalAirflowBalance(disconnected, project.hvacSystems[0].id, "supply")
      .remaining,
  ).toBe(900);
  expect(() => projectSchema.parse(disconnected)).not.toThrow();
});

it("changes length and modularity on a connected point without adding a second point or losing its association", () => {
  let project = fixture();
  project = saveTerminalOnPlan(project, input(project), { x: 4, y: 2 });
  project = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    project.hvacSystems[0].id,
  );
  const savedId = project.airTerminals[0].id;
  const changed = saveTerminalOnPlan(
    project,
    input(project, [2000, 1000]),
    { x: 4, y: 2 },
    savedId,
  );
  expect(changed.airTerminals).toHaveLength(2);
  expect(
    changed.airTerminals.every(
      (terminal) => terminal.systemId === project.hvacSystems[0].id,
    ),
  ).toBe(true);
  expect(linearRunMembers(changed, changed.airTerminals[1])).toHaveLength(2);
  const single = saveTerminalOnPlan(
    changed,
    input(changed),
    { x: 4, y: 2 },
    changed.airTerminals[1].id,
  );
  expect(single.airTerminals).toHaveLength(1);
  expect(single.airTerminals[0].position).toEqual({ x: 4, y: 2 });
  expect(() => projectSchema.parse(single)).not.toThrow();
});

it("keeps independent balances for two machines in the same room and installation", () => {
  let project = fixture();
  const first = project.hvacSystems[0];
  project = applyManualDuctedSystem(
    project,
    first.roomIds,
    { ...first.genericMachine!, model: "Seconda macchina", maxAirflowM3h: 500 },
    null,
    first.installationId,
  );
  const second = project.hvacSystems[1];
  project = placeMachineOnPlan(project, second.id, project.rooms[0].id, {
    x: 6,
    y: 4,
  });
  project = saveTerminalOnPlan(
    project,
    { ...input(project), systemId: second.id },
    { x: 4, y: 2 },
  );
  project = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    second.id,
  );
  const capacity = project.airTerminals[0].availableAirflowM3h;
  expect(
    terminalAirflowBalance(project, first.id, "supply", project.rooms[0].id),
  ).toMatchObject({ required: 0, installed: 0, remaining: 0 });
  expect(
    terminalAirflowBalance(project, second.id, "supply", project.rooms[0].id),
  ).toMatchObject({
    required: 500,
    installed: capacity,
    remaining: Math.max(0, 500 - capacity),
  });
  const reassigned = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    first.id,
  );
  expect(
    terminalAirflowBalance(reassigned, second.id, "supply").installed,
  ).toBe(0);
  expect(terminalAirflowBalance(reassigned, first.id, "supply").installed).toBe(
    capacity,
  );
});

it("deletes pending points with their intended installation and rejects incoherent pending references", () => {
  let project = fixture();
  project = saveTerminalOnPlan(project, input(project), { x: 4, y: 2 });
  expect(
    removeInstallation(project, project.installations[0].id).airTerminals,
  ).toHaveLength(0);
  expect(() =>
    projectSchema.parse({
      ...project,
      airTerminals: [
        { ...project.airTerminals[0], pendingSystemId: "missing" },
      ],
    }),
  ).toThrow();
});

it("copies a room with pending terminals without linking the copied points to the original machine", () => {
  let project = fixture();
  project = saveTerminalOnPlan(project, input(project), { x: 4, y: 2 });
  const copied = duplicateSelection(
    project,
    [{ kind: "room", id: project.rooms[0].id }],
    { x: 12, y: 0 },
  );
  expect(copied.airTerminals).toHaveLength(2);
  expect(copied.airTerminals[1].pendingSystemId).not.toBe(
    project.hvacSystems[0].id,
  );
  expect(() => projectSchema.parse(copied)).not.toThrow();
});

it("rejects out-of-room positions, missing dimensions, incompatible machines and locked modules without mutating the original", () => {
  const project = fixture();
  const snapshot = structuredClone(project);
  expect(() =>
    saveTerminalOnPlan(project, input(project), { x: 4, y: 2 }, "missing"),
  ).toThrow("non esiste più");
  expect(() =>
    placeMachineOnPlan(
      project,
      project.hvacSystems[0].id,
      project.rooms[0].id,
      { x: 0, y: 0 },
    ),
  ).toThrow("rientrare");
  expect(() =>
    saveTerminalOnPlan(project, input(project, [2000, 1000]), { x: 0.2, y: 2 }),
  ).toThrow();
  expect(() =>
    saveTerminalOnPlan(project, input(project), { x: NaN, y: 2 }),
  ).toThrow();
  const unplaced = {
    ...project,
    hvacSystems: project.hvacSystems.map((system) => ({
      ...system,
      genericMachine: { ...system.genericMachine!, widthMm: undefined },
      indoorUnits: [],
    })),
  };
  expect(() =>
    placeMachineOnPlan(
      unplaced,
      project.hvacSystems[0].id,
      project.rooms[0].id,
      { x: 2, y: 4 },
    ),
  ).toThrow("dimensioni");
  let configured = saveTerminalOnPlan(project, input(project, [2000, 1000]), {
    x: 4,
    y: 2,
  });
  configured = addRectangle(configured, configured.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    origin: { x: 10, y: 0 },
    name: "Non servito",
  });
  const wrong = {
    ...configured,
    hvacSystems: configured.hvacSystems.map((system) => ({
      ...system,
      roomIds: [configured.rooms[1].id],
    })),
  };
  expect(
    connectTerminalOnPlan(
      wrong,
      configured.airTerminals[0].id,
      project.hvacSystems[0].id,
    ).hvacSystems[0].roomIds,
  ).toEqual([configured.rooms[0].id]);
  configured.airTerminals[1].locked = true;
  expect(() =>
    connectTerminalOnPlan(
      configured,
      configured.airTerminals[0].id,
      project.hvacSystems[0].id,
    ),
  ).toThrow("Sbloccare");
  expect(() =>
    saveTerminalOnPlan(
      configured,
      input(configured),
      { x: 4, y: 2 },
      configured.airTerminals[0].id,
    ),
  ).toThrow("Sbloccare");
  expect(project).toEqual(snapshot);
});

it("moves a terminal to the independent installation of its new machine", () => {
  let project = fixture();
  const first = project.hvacSystems[0];
  project = saveTerminalOnPlan(project, input(project), { x: 4, y: 2 });
  project = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    first.id,
  );
  project = createInstallation(project, "ducted", project.rooms[0].id);
  const installationId = project.installations.at(-1)!.id;
  project = applyManualDuctedSystem(
    project,
    first.roomIds,
    { ...first.genericMachine!, model: "Indipendente", maxAirflowM3h: 500 },
    null,
    installationId,
  );
  const second = project.hvacSystems.at(-1)!;
  project = placeMachineOnPlan(project, second.id, project.rooms[0].id, {
    x: 6,
    y: 4,
  });
  const connected = connectTerminalOnPlan(
    project,
    project.airTerminals[0].id,
    second.id,
  );
  expect(connected.airTerminals[0]).toMatchObject({
    systemId: second.id,
    installationId,
  });
  expect(terminalAirflowBalance(connected, first.id, "supply").installed).toBe(
    0,
  );
  expect(
    terminalAirflowBalance(connected, second.id, "supply").installed,
  ).toBeGreaterThan(0);
  expect(
    removeInstallation(connected, first.installationId!).airTerminals,
  ).toHaveLength(1);
  expect(
    decodeProject(encodeProject(connected)).airTerminals[0].installationId,
  ).toBe(installationId);
});

it("moves an incomplete machine to another room, registering the room without duplicating it", () => {
  let project = ensureInstallations(guidedProjectFixture());
  project = addRectangle(project, project.floors[0].id, {
    width: 20,
    length: 18,
    height: 4,
    name: "Sala enorme",
    origin: { x: 20, y: 0 },
  });
  const installationId = project.installations.find(
    (item) => item.type === "ducted",
  )!.id;
  const target = project.rooms[1];
  project = placeDuctedDraft(
    { ...project, hvacSystems: [] },
    installationId,
    project.rooms[0].id,
    { x: 4, y: 2 },
    "machine",
  );
  const draftId = project.ductedDrafts![0].id;
  expect(
    project.installations.find((item) => item.id === installationId)!.roomIds,
  ).toEqual([project.rooms[0].id]);
  const moved = moveDuctedDraft(project, draftId, target.centroid);
  expect(moved.ductedDrafts).toHaveLength(1);
  expect(moved.ductedDrafts![0]).toMatchObject({
    id: draftId,
    roomId: target.id,
    floorId: target.floorId,
    position: target.centroid,
  });
  expect(
    moved.installations.find((item) => item.id === installationId)!.roomIds,
  ).toEqual([project.rooms[0].id, target.id]);
  expect(() => projectSchema.parse(moved)).not.toThrow();
  expect(() => moveDuctedDraft(project, draftId, { x: -5, y: -5 })).toThrow(
    "Scegli un punto in un ambiente valido",
  );
});

it("keeps a placed machine assigned to the room it is moved into", () => {
  let project = fixture();
  project = addRectangle(project, project.floors[0].id, {
    width: 6,
    length: 5,
    height: 2.7,
    name: "Sala enorme",
    origin: { x: 20, y: 0 },
  });
  const unit = project.hvacSystems[0].indoorUnits[0];
  const target = project.rooms[1];
  const moved = movePlacedDevice(project, unit.id, target.centroid);
  expect(moved.hvacSystems[0].indoorUnits[0]).toMatchObject({
    id: unit.id,
    roomId: target.id,
    position: target.centroid,
  });
  expect(() => projectSchema.parse(moved)).not.toThrow();
});
