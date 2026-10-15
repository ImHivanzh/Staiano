import { beforeEach, expect, it } from "vitest";
import { useProjectStore } from "./project-store";
import { guidedProjectFixture } from "../../tests/guided-fixture";

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
