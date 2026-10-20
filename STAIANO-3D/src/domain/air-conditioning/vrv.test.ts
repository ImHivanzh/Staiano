import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import { projectSchema } from "@/schemas/project";
import { vrvCatalog } from "@/domain/catalogs/vrv";
import { applyVrvSystem } from "./vrv-apply";
import { sizeVrvSystems } from "./vrv-size";
import { validateVrvSystem } from "./vrv-validate";
import { refreshVrvBindings } from "./vrv-refresh";
import { encodeProject, decodeProject } from "@/services/project/format";

function fixture() {
  let p = createProject();
  p = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera1",
  });
  p = addRectangle(p, p.floors[0].id, {
    width: 4,
    length: 3.5,
    height: 2.7,
    name: "Camera2",
  });
  return p;
}

describe("VRV/VRF con dati ufficiali Daikin", () => {
  it("seleziona una unità interna pubblicata per ambiente e un'esterna entro il rapporto di connessione", () => {
    const p = fixture(),
      roomIds = p.rooms.map((room) => room.id),
      solutions = sizeVrvSystems(p, roomIds, vrvCatalog);
    expect(solutions.length).toBeGreaterThan(0);
    const solution = solutions[0];
    expect(solution.assignments).toHaveLength(2);
    expect(
      solution.assignments.every(
        (assignment) =>
          assignment.indoor.nominalCoolingW >=
            p.rooms.find((room) => room.id === assignment.roomId)!
              .designLoadW &&
          assignment.indoor.nominalHeatingW >=
            p.rooms.find((room) => room.id === assignment.roomId)!
              .designLoadW,
      ),
    ).toBe(true);
    expect(solution.connectionRatio).toBeGreaterThanOrEqual(
      solution.outdoor.minConnectionRatio,
    );
    expect(solution.connectionRatio).toBeLessThanOrEqual(
      solution.outdoor.maxConnectionRatio,
    );
    expect(solution.outdoor.coolingW).toBeGreaterThanOrEqual(
      solution.requiredW,
    );
  });
  it("salva e ricarica un sistema VRV con ID e posa invariati", () => {
    let p = fixture();
    p = applyVrvSystem(
      p,
      p.rooms.map((room) => room.id),
      null,
    );
    expect(p.hvacSystems[0].type).toBe("vrv");
    expect(p.hvacSystems[0].indoorUnits).toHaveLength(2);
    expect(p.rooms.every((room) => room.systemType === "vrv")).toBe(true);
    expect(projectSchema.safeParse(p).success).toBe(true);
    expect(
      validateVrvSystem(p, p.hvacSystems[0]).filter(
        (check) => check.status === "invalid",
      ),
    ).toEqual([]);
    const restored = decodeProject(encodeProject(p));
    expect(
      restored.hvacSystems[0].indoorUnits.map((unit) => unit.id),
    ).toEqual(p.hvacSystems[0].indoorUnits.map((unit) => unit.id));
    expect(restored.hvacSystems[0].catalogVersion).toBe(
      p.hvacSystems[0].catalogVersion,
    );
    expect(
      validateVrvSystem(restored, restored.hvacSystems[0]).filter(
        (check) => check.status === "invalid",
      ),
    ).toEqual([]);
  });
  it("invalida la verifica quando la scala non è più verificata, senza perdere le unità", () => {
    let p = fixture();
    p = applyVrvSystem(
      p,
      p.rooms.map((room) => room.id),
      null,
    );
    const saved = structuredClone(p.hvacSystems[0]);
    p.floors[0].scaleVerified = false;
    const refreshed = refreshVrvBindings(p);
    expect(refreshed.hvacSystems[0].compatibilityStatus).toBe("invalid");
    expect(refreshed.hvacSystems[0].indoorUnits).toEqual(saved.indoorUnits);
  });
  it("non inventa soluzioni quando nessuna unità interna copre il carico", () => {
    const p = fixture();
    p.rooms[0].designLoadW = 20000;
    expect(
      sizeVrvSystems(p, p.rooms.map((room) => room.id), vrvCatalog),
    ).toEqual([]);
    expect(() =>
      applyVrvSystem(
        p,
        p.rooms.map((room) => room.id),
        null,
      ),
    ).toThrow();
  });
});
