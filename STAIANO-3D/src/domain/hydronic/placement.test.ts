import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { heatPumpCatalog } from "@/domain/catalogs/heat-pumps";
import { applyHydronicSystem, moveHydronicOutdoorUnit } from "./apply";
import { hydronicOutdoorValid, hydronicOutwardRotation } from "./placement";
import { projectSchema } from "@/schemas/project";

describe("orientamento iniziale della pompa di calore", () => {
  it("saves a raised outdoor unit on brackets and keeps its elevation on model refresh", () => {
    const empty = createProject();
    const room = addRectangle(empty, empty.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Salone",
    });
    const input = {
      productId: heatPumpCatalog.products[0].id,
      roomIds: [room.rooms[0].id],
      fanCoilIds: [],
      operatingPointIndex: 0,
    };
    let project = applyHydronicSystem(room, input);
    const system = project.hydronicSystems![0];
    const elevationM = 2.2 + system.outdoorUnit.heightMm / 2000;
    project = moveHydronicOutdoorUnit(project, system.outdoorUnit.id, {
      elevationM,
      mounting: "brackets",
    });
    project = applyHydronicSystem(project, { ...input, systemId: system.id });
    expect(project.hydronicSystems![0].outdoorUnit).toMatchObject({
      elevationM,
      mounting: "brackets",
    });
    expect(projectSchema.safeParse(project).success).toBe(true);
  });
  it("rivolge il ventilatore verso l’esterno e conserva le rotazioni confermate", () => {
    const empty = createProject();
    const project = addRectangle(empty, empty.floors[0].id, {
      width: 8,
      length: 6,
      height: 2.7,
      name: "Salone",
    });
    const input = {
      productId: heatPumpCatalog.products[0].id,
      roomIds: [project.rooms[0].id],
      fanCoilIds: [],
      operatingPointIndex: 0,
    };
    const placed = applyHydronicSystem(project, input);
    const system = placed.hydronicSystems![0];
    const unit = system.outdoorUnit;
    // The 3D fan faces local +Z, equivalent to +Y in the plan at rotation zero.
    const frontY =
      unit.position.y + (Math.cos(unit.rotation) * unit.depthMm) / 2000;
    const backY =
      unit.position.y - (Math.cos(unit.rotation) * unit.depthMm) / 2000;
    expect(frontY).toBeLessThan(backY);
    expect(hydronicOutdoorValid(placed, unit)).toBe(true);
    expect(
      Math.cos(hydronicOutwardRotation(placed, { ...unit, rotation: 0 })),
    ).toBeCloseTo(-1);
    const right = { ...unit, position: { x: 10, y: 3 } };
    expect(-Math.sin(hydronicOutwardRotation(placed, right))).toBeCloseTo(1);

    const rotated = moveHydronicOutdoorUnit(placed, unit.id, {
      rotation: Math.PI / 4,
    });
    const updated = applyHydronicSystem(rotated, {
      ...input,
      systemId: system.id,
    });
    expect(updated.hydronicSystems![0].outdoorUnit.rotation).toBe(Math.PI / 4);
    const second = applyHydronicSystem(updated, input);
    expect(second.hydronicSystems![0].outdoorUnit.rotation).toBe(Math.PI / 4);
    expect(second.hydronicSystems![1].outdoorUnit.rotation).toBe(Math.PI);
  });
});
