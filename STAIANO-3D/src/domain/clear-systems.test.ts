import { describe, expect, it } from "vitest";
import { clearProjectSystems, newId } from "./project";
import { projectSchema } from "@/schemas/project";
import { useProjectStore } from "@/stores/project-store";
import { realisticProjectFixture } from "../../tests/realistic-project";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../tests/guided-fixture";
import { placeSupplyPlenum } from "./ducted/placement";
import { generateDuctRoutes } from "./ducted/routes";
import { applyFanCoil } from "./fan-coils/apply";
import { applyHydronicSystem } from "./hydronic/apply";
import { heatPumpCatalog } from "./catalogs/heat-pumps";

function fixture() {
  const home = realisticProjectFixture();
  let guided = guidedProjectFixture();
  guided = addGuidedTerminal(guided, 1000);
  guided = generateDuctRoutes(
    placeSupplyPlenum(guided, guided.hvacSystems[0].id),
    guided.hvacSystems[0].id,
  );
  guided = applyFanCoil(guided, guided.rooms[0].id, "aermec-fcz100");
  guided = applyHydronicSystem(guided, {
    productId: heatPumpCatalog.products[0].id,
    roomIds: [guided.rooms[0].id],
    fanCoilIds: guided.fanCoils!.map((unit) => unit.id),
    operatingPointIndex: 0,
  });
  home.floors[0].configurationWizard = {
    step: 10,
    confirmedSteps: [0, 7, 8, 9, 10],
    status: "complete",
  };
  home.walls[0].locked = true;
  home.floors[0].background = {
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    widthPx: 1000,
    heightPx: 800,
    metersPerPixel: 0.01,
    origin: { x: -1, y: 2 },
    opacity: 0.5,
    filename: "planimetria.png",
  };
  home.sourceFilesMetadata = [
    {
      id: newId(),
      filename: "planimetria.png",
      mimeType: "image/png",
      sizeBytes: 8,
      importedAt: home.createdAt,
      floorId: home.floors[0].id,
      sourceType: "raster",
      originalDataUrl: home.floors[0].background.dataUrl,
    },
  ];
  home.pillars = [
    {
      id: newId(),
      floorId: home.floors[0].id,
      position: { x: 2, y: 2 },
      rotation: 0,
      widthMm: 300,
      depthMm: 300,
      heightMm: 2700,
      locked: true,
    },
  ];
  for (const key of [
    "floors",
    "walls",
    "rooms",
    "openings",
    "hvacSystems",
    "radiators",
    "fanCoils",
    "hydronicSystems",
    "airTerminals",
    "plenums",
    "ducts",
  ] as const) {
    // Fixture combines two independent floors and their existing equipment.
    Object.assign(home, {
      [key]: [...(home[key] ?? []), ...(guided[key] ?? [])],
    });
  }
  return projectSchema.parse(home);
}

describe("clear project systems", () => {
  it("clears equipment on every floor, preserves the plan and supports undo/redo and reopening", () => {
    useProjectStore.getState().load(fixture());
    const before = structuredClone(useProjectStore.getState().project!);
    useProjectStore
      .getState()
      .select({ kind: "device", id: before.radiators[0].id });
    useProjectStore.getState().commit(clearProjectSystems);
    const state = useProjectStore.getState();
    expect(state.error).toBeNull();
    expect(state.selection).toEqual([]);
    expect(state.dirty).toBe(true);
    const after = state.project!;
    for (const key of [
      "hvacSystems",
      "hydronicSystems",
      "radiators",
      "fanCoils",
      "airTerminals",
      "plenums",
      "ducts",
    ] as const) {
      expect(before[key]?.length, key).toBeGreaterThan(0);
      expect(after[key], key).toEqual([]);
    }
    for (const key of [
      "id",
      "name",
      "walls",
      "openings",
      "pillars",
      "sourceFilesMetadata",
      "projectSettings",
    ] as const)
      expect(after[key], key).toEqual(before[key]);
    expect(after.rooms).toEqual(
      before.rooms.map((room) => ({
        ...room,
        systemType: "none",
        supplyPoints: 1,
        returnPoints: 1,
      })),
    );
    expect(after.floors[0]).toEqual({
      ...before.floors[0],
      configurationWizard: {
        step: 8,
        confirmedSteps: [0, 7],
        status: "paused",
      },
    });
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project?.hvacSystems).toEqual(
      before.hvacSystems,
    );
    useProjectStore.getState().redo();
    useProjectStore.getState().load(useProjectStore.getState().project!);
    expect(useProjectStore.getState().project?.hvacSystems).toEqual([]);
    expect(
      useProjectStore
        .getState()
        .project?.rooms.every((room) => room.systemType === "none"),
    ).toBe(true);
  });

  it("keeps the existing lock protection without losing equipment or history", () => {
    const project = fixture();
    project.radiators[0].locked = true;
    useProjectStore.getState().load(project);
    const before = useProjectStore.getState().project;
    useProjectStore.getState().commit(clearProjectSystems);
    expect(useProjectStore.getState().error).toMatch(/Sbloccare/);
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().past).toEqual([]);
  });
});
