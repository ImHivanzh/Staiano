import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import type { Project } from "@/schemas/project";
import { createInstallation } from "@/domain/installations";
import { applyDuctedSystem } from "./apply";
import { machineLoadDivisor, machinesServingSameRooms } from "./machine";
import { refreshDuctedBindings } from "./refresh";
import { validateProject } from "@/domain/validation";

const LOAD_W = 30_000;
const MACHINES = 6;
/** Macchina canalizzata Daikin da 5,0 kW: una sesta parte di 30 kW. */
const MACHINE_ID = "daikin-fba50a9-rxm50a-9-";

/** Un ambiente molto grande con più macchine, ognuna nel proprio impianto. */
function roomWithMachines(count: number): { project: Project; roomId: string } {
  let project = createProject("Salone con più macchine");
  project = addRectangle(project, project.floors[0].id, {
    width: 20,
    length: 15,
    height: 3,
    name: "Salone",
  });
  const roomId = project.rooms[0].id;
  project = {
    ...project,
    rooms: project.rooms.map((room) => ({ ...room, designLoadW: LOAD_W })),
  };
  for (let index = 0; index < count; index++) {
    project = createInstallation(project, "ducted", roomId);
    const installation = project.installations.at(-1)!;
    project = applyDuctedSystem(
      project,
      [roomId],
      "Daikin",
      null,
      MACHINE_ID,
      installation.id,
      count,
    );
  }
  return { project, roomId };
}

describe("macchine canalizzate nello stesso ambiente", () => {
  it("conta le macchine che servono gli stessi ambienti", () => {
    const { project, roomId } = roomWithMachines(MACHINES);
    expect(project.hvacSystems).toHaveLength(MACHINES);
    const current = project.hvacSystems[0].id;
    expect(machinesServingSameRooms(project, [roomId], current)).toBe(MACHINES);
    expect(machineLoadDivisor(project, [roomId], undefined, current)).toBe(
      MACHINES,
    );
    // La macchina in modifica non conta due volte.
    expect(
      machinesServingSameRooms(project, [roomId], project.hvacSystems[0].id),
    ).toBe(MACHINES);
  });

  it("consiglia una taglia per macchina, non per l'intero ambiente", () => {
    const { project, roomId } = roomWithMachines(MACHINES);
    const capacities = project.hvacSystems.map(
      (system) => system.capacityW ?? 0,
    );
    expect(new Set(capacities)).toEqual(new Set([LOAD_W / MACHINES]));
    expect(
      project.hvacSystems.every(
        (system) => system.plannedMachines === MACHINES,
      ),
    ).toBe(true);
    const refreshed = refreshDuctedBindings(project);
    expect(
      refreshed.hvacSystems.every((system) => (system.capacityW ?? 0) < LOAD_W),
    ).toBe(true);
    expect(
      machinesServingSameRooms(
        refreshed,
        [roomId],
        refreshed.hvacSystems[0].id,
      ),
    ).toBe(MACHINES);
  });

  it("verifica la copertura sul carico per macchina", () => {
    const { project } = roomWithMachines(MACHINES);
    const checks = validateProject(project).filter(
      (check) => check.code === "machinePower",
    );
    expect(checks).toHaveLength(MACHINES);
    expect(checks.every((check) => check.status !== "invalid")).toBe(true);
  });

  it("senza altre macchine il carico resta quello dell'ambiente", () => {
    let project = createProject("Salone");
    project = addRectangle(project, project.floors[0].id, {
      width: 10,
      length: 8,
      height: 3,
      name: "Salone",
    });
    const roomId = project.rooms[0].id;
    project = {
      ...project,
      rooms: project.rooms.map((room) => ({ ...room, designLoadW: 12_000 })),
    };
    project = applyDuctedSystem(project, [roomId], "Daikin", null);
    const current = project.hvacSystems[0].id;
    expect(machinesServingSameRooms(project, [roomId], current)).toBe(1);
    expect(machineLoadDivisor(project, [roomId], undefined, current)).toBe(1);
    expect(project.hvacSystems[0].capacityW).toBeGreaterThanOrEqual(12_000);
  });
});
