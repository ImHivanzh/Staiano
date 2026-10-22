import { beforeEach, expect, it } from "vitest";
import { useProjectStore } from "./project-store";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../tests/guided-fixture";
import {
  connectPlenum,
  insertPlenum,
} from "@/domain/ducted/attached-plenums";
import { placeMachineOnPlan } from "@/domain/ducted/graphic-installation";
import { placeSupplyPlenum } from "@/domain/ducted/placement";
import { removeSelection } from "@/domain/geometry/selection";
import { rotateDevice90 } from "@/domain/geometry/rotate-device";

beforeEach(() => {
  useProjectStore.setState({ readOnly: false });
  useProjectStore.getState().load(guidedProjectFixture());
});

it("prevents edits, undo and redo while another tab owns the shared project", () => {
  const state = useProjectStore.getState();
  state.commit((project) => ({ ...project, name: "Prima modifica" }));
  const project = useProjectStore.getState().project;
  useProjectStore.setState({ readOnly: true });
  state.commit((current) => ({ ...current, name: "Modifica negata" }));
  state.undo();
  state.redo();
  expect(useProjectStore.getState().project).toBe(project);
  expect(useProjectStore.getState().error).toContain("sola lettura");
  useProjectStore.setState({ readOnly: false });
  state.undo();
  expect(useProjectStore.getState().project?.name).not.toBe("Prima modifica");
});

it("opens an installation plan without modifying saved project or history", () => {
  const before = useProjectStore.getState();
  const installation = before.project!.installations[0];
  before.select({ kind: "room", id: before.project!.rooms[0].id });
  before.setView("3d");
  before.openInstallationPlan(installation.id);
  const after = useProjectStore.getState();
  expect(after.installationPlanId).toBeNull();
  expect(after.ductedInstallationId).toBe(installation.id);
  expect(after.activeFloorId).toBe(before.project!.rooms[0].floorId);
  expect(after.view).toBe("2d");
  expect(after.selection).toEqual([]);
  expect(after.project).toBe(before.project);
  expect(after.revision).toBe(before.revision);
  expect(after.dirty).toBe(false);
  expect(after.past).toEqual([]);
});

it("ignores an unknown installation and clears the plan on view, floor or project changes", () => {
  const state = useProjectStore.getState();
  const id = state.project!.installations[0].id;
  state.openInstallationPlan("missing");
  expect(useProjectStore.getState().installationPlanId).toBeNull();
  state.openInstallationPlan(id);
  state.setView("3d");
  expect(useProjectStore.getState().installationPlanId).toBeNull();
  state.openInstallationPlan(id);
  state.setFloor(state.activeFloorId);
  expect(useProjectStore.getState().installationPlanId).toBeNull();
  state.openInstallationPlan(id);
  state.load(guidedProjectFixture());
  expect(useProjectStore.getState().installationPlanId).toBeNull();
});

it("eliminando il plenum macchina non ricrea i flessibili appesi", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  const machine = p.plenums.find(
    (pl) =>
      pl.systemId && !p.airTerminals.some((t) => t.id === pl.attachmentId),
  )!;
  expect(p.ducts!.length).toBeGreaterThan(0);
  useProjectStore.getState().load(p);
  useProjectStore
    .getState()
    .commit((project) =>
      removeSelection(project, [{ kind: "device", id: machine.id }]),
    );
  const after = useProjectStore.getState().project!;
  expect(after.plenums.some((pl) => pl.id === machine.id)).toBe(false);
  expect(after.ducts ?? []).toHaveLength(0);
});

it("ruota una volta la macchina e il suo plenum manuale", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  const id = p.plenums[0].id;
  const machineId = p.hvacSystems[0].indoorUnits[0].id;
  p = connectPlenum(p, id, machineId);
  useProjectStore.getState().load(p);
  const before = p.plenums.find((pl) => pl.id === id)!;
  useProjectStore
    .getState()
    .commit((project) => rotateDevice90(project, machineId));
  const after = useProjectStore.getState().project!;
  expect(after.hvacSystems[0].indoorUnits[0].rotation).toBeCloseTo(
    Math.PI / 2,
  );
  expect(after.plenums.find((pl) => pl.id === id)!.rotation).toBeCloseTo(
    before.rotation + Math.PI / 2,
  );
});

it("keeps every equipment type on the main plan", () => {
  const state = useProjectStore.getState();
  const project = state.project!;
  const id = "split-installation";
  useProjectStore.setState({
    project: {
      ...project,
      installations: [
        ...project.installations,
        { id, name: "Split", type: "split", roomIds: [project.rooms[0].id] },
      ],
    },
  });
  const before = useProjectStore.getState().project;
  state.openInstallationPlan(id);
  expect(useProjectStore.getState().installationPlanId).toBeNull();
  expect(useProjectStore.getState().view).toBe("2d");
  expect(useProjectStore.getState().project).toBe(before);
});
