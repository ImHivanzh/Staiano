import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "./project";
import {
  projectProgress,
  resolveCheckTarget,
  validateProject,
  filterProjectChecks,
} from "./validation";
import { saveOpening } from "./geometry/openings";
import { radiatorProducts } from "./catalogs/radiators";
import { sizeRadiators } from "./radiators/size";
import { applyRadiatorSolution } from "./radiators/apply";
import { guidedProjectFixture } from "../../tests/guided-fixture";
import { placeDuctedMachine } from "./ducted/placement";

function roomProject() {
  const project = createProject();
  return addRectangle(project, project.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Studio",
  });
}

function radiatorProject() {
  const project = roomProject();
  const solution = sizeRadiators(
    project.rooms[0].designLoadW,
    radiatorProducts.filter((product) => product.id === "global-vip-600"),
    50,
    { manufacturer: "Global", family: "VIP", numberOfRadiators: 1 },
  )[0];
  return applyRadiatorSolution(project, project.rooms[0].id, solution, null);
}

describe("project completeness", () => {
  it("distinguishes verified geometry from a room without equipment", () => {
    const project = roomProject();
    const checks = validateProject(project);
    expect(checks).toContainEqual(
      expect.objectContaining({
        code: "systemConfiguration",
        status: "warning",
        entityId: project.rooms[0].id,
      }),
    );
    expect(projectProgress(project, checks)).toEqual({
      geometryVerified: true,
      status: "warning",
      label: "Impianti da completare: 1",
    });
    project.rooms[0].systemType = "radiator";
    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        code: "systemConfiguration",
        status: "warning",
      }),
    );
  });

  it("checks actual equipment, keeps technical warnings and rechecks after removal", () => {
    const project = radiatorProject();
    expect(projectProgress(project, validateProject(project))).toMatchObject({
      geometryVerified: true,
      status: "valid",
      label: "Pronto per dossier preliminare",
    });
    project.floors[0].configurationWizard = {
      step: 0,
      confirmedSteps: [],
      status: "paused",
    };
    expect(projectProgress(project, validateProject(project)).label).toBe(
      "Revisione tecnica richiesta",
    );
    project.radiators = [];
    expect(projectProgress(project, validateProject(project)).status).toBe(
      "invalid",
    );
    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        code: "systemConfiguration",
        status: "warning",
      }),
    );
  });

  it("does not mark an empty project or an uncalibrated floor as ready", () => {
    const empty = createProject();
    expect(projectProgress(empty, validateProject(empty))).toMatchObject({
      geometryVerified: false,
      label: "Ambienti da definire",
    });
    const project = roomProject();
    project.floors[0].scaleVerified = false;
    expect(projectProgress(project, validateProject(project))).toMatchObject({
      geometryVerified: false,
      status: "invalid",
      label: "Errori da correggere",
    });
  });

  it("recognizes a ducted machine shared by rooms without requiring one machine per room", () => {
    const base = guidedProjectFixture();
    const project = placeDuctedMachine(base, base.hvacSystems[0].id);
    const secondRoom = {
      ...project.rooms[0],
      id: "second-room",
      name: "Camera",
    };
    project.rooms.push(secondRoom);
    project.hvacSystems[0].roomIds.push(secondRoom.id);
    expect(
      validateProject(project)
        .filter((check) => check.code === "systemConfiguration")
        .every((check) => check.status === "valid"),
    ).toBe(true);
  });
});

describe("check navigation", () => {
  it("resolves floor, room, opening wall and device; rejects stale identifiers", () => {
    const base = radiatorProject();
    const project = saveOpening(base, base.walls[0].id, {
      type: "door",
      offsetM: 2,
      widthM: 0.8,
      heightM: 2.1,
      sillHeightM: null,
    });
    expect(resolveCheckTarget(project, project.floors[0].id)).toEqual({
      floorId: project.floors[0].id,
      selection: null,
    });
    for (const [id, kind] of [
      [project.rooms[0].id, "room"],
      [project.walls[0].id, "wall"],
      [project.radiators[0].id, "device"],
    ])
      expect(resolveCheckTarget(project, id)).toEqual({
        floorId: project.floors[0].id,
        selection: { kind, id },
      });
    expect(
      resolveCheckTarget(project, project.openings[0].id)?.selection,
    ).toEqual({
      kind: "wall",
      id: project.walls[0].id,
    });
    expect(resolveCheckTarget(project, undefined)).toBeNull();
    expect(resolveCheckTarget(project, "removed-object")).toBeNull();
  });

  it("resolves a system to its machine on the correct floor", () => {
    const base = guidedProjectFixture();
    const project = placeDuctedMachine(base, base.hvacSystems[0].id);
    const machine = project.hvacSystems[0].indoorUnits[0];
    expect(resolveCheckTarget(project, project.hvacSystems[0].id)).toEqual({
      floorId: machine.floorId,
      selection: { kind: "device", id: machine.id },
    });
    project.hvacSystems[0].indoorUnits = [];
    expect(
      resolveCheckTarget(project, project.hvacSystems[0].id)?.selection,
    ).toEqual({
      kind: "room",
      id: project.rooms[0].id,
    });
  });
});

describe("check filters", () => {
  it("shows problems first, filters by status, and keeps general checks visible", () => {
    const project = roomProject();
    const otherFloor = {
      ...project.floors[0],
      id: "another-floor",
      name: "Altro piano",
    };
    project.floors.push(otherFloor);
    const otherRoom = {
      ...project.rooms[0],
      id: "another-room",
      floorId: otherFloor.id,
      name: "Camera",
    };
    project.rooms.push(otherRoom);
    const checks = [
      {
        code: "name",
        status: "warning" as const,
        entityId: otherRoom.id,
        message: "Altro ambiente",
      },
      {
        code: "geometry",
        status: "valid" as const,
        entityId: project.rooms[0].id,
        message: "Valido",
      },
      {
        code: "power",
        status: "invalid" as const,
        entityId: project.rooms[0].id,
        message: "Potenza",
      },
      {
        code: "overlap",
        status: "warning" as const,
        message: "Controllo generale",
      },
    ];
    expect(
      filterProjectChecks(project, checks, {
        status: "problems",
        floorId: "",
        roomId: "",
      }).map((check) => check.code),
    ).toEqual(["power", "name", "overlap"]);
    expect(
      filterProjectChecks(project, checks, {
        status: "all",
        floorId: project.floors[0].id,
        roomId: project.rooms[0].id,
      }).map((check) => check.code),
    ).toEqual(["power", "overlap", "geometry"]);
    expect(
      filterProjectChecks(project, checks, {
        status: "invalid",
        floorId: otherFloor.id,
        roomId: otherRoom.id,
      }),
    ).toEqual([]);
  });

  it("finds opening checks through the wall and shared system checks through all served rooms", () => {
    const base = guidedProjectFixture();
    let project = placeDuctedMachine(base, base.hvacSystems[0].id);
    const originalRoom = project.rooms[0];
    project = addRectangle(project, project.floors[0].id, {
      width: 4,
      length: 3,
      height: 2.7,
      name: "Camera",
      origin: { x: 12, y: 0 },
    });
    const second = project.rooms.find((room) => room.id !== originalRoom.id)!;
    project.hvacSystems[0].roomIds.push(second.id);
    project = saveOpening(project, originalRoom.wallIds[0], {
      type: "door",
      offsetM: 1,
      widthM: 0.8,
      heightM: 2.1,
      sillHeightM: null,
    });
    const checks = [
      {
        code: "machinePower",
        status: "warning" as const,
        entityId: project.hvacSystems[0].id,
        message: "Macchina",
      },
      {
        code: "openingDimensions",
        status: "invalid" as const,
        entityId: project.openings[0].id,
        message: "Porta",
      },
    ];
    expect(
      filterProjectChecks(project, checks, {
        status: "all",
        floorId: "",
        roomId: second.id,
      }).map((check) => check.code),
    ).toEqual(["machinePower"]);
    expect(
      filterProjectChecks(project, checks, {
        status: "all",
        floorId: "",
        roomId: originalRoom.id,
      }).map((check) => check.code),
    ).toEqual(["openingDimensions", "machinePower"]);
  });
});
