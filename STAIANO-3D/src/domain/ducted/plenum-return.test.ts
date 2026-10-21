import { describe, expect, it } from "vitest";
import type { Project } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import { createProject, addRectangle } from "@/domain/project";
import { applyDuctedSystem, ductedRoomAllocation } from "./apply";
import { refreshDuctedBindings } from "./refresh";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { calculatePlenum } from "./plenum";
import { placePlenum, placeSupplyPlenum } from "./placement";
import { connectPlenum, insertPlenum } from "./attached-plenums";
import { validateProject } from "../validation";

function terminals(
  project: Project,
  roomId: string,
  use: "supply" | "return",
  points: number,
) {
  const allocation = ductedRoomAllocation(project, roomId)!;
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === (use === "supply" ? "EDLS" : "EGQ"),
  )!;
  const solution = sizeAirTerminal(
    allocation.airflowM3h,
    points,
    family,
    use,
  )[0];
  expect(solution).toBeDefined();
  return applyAirTerminalSolution(
    project,
    roomId,
    allocation.system.id,
    use,
    family.familyCode,
    solution,
    family.mountings!.includes("ceiling") ? "ceiling" : "wall",
  );
}

function fixture() {
  let p = createProject();
  p = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera",
  });
  const room = p.rooms[0];
  p = applyDuctedSystem(p, [room.id], "Mitsubishi Electric", null);
  p = terminals(p, room.id, "supply", 2);
  p = terminals(p, room.id, "return", 1);
  return refreshDuctedBindings(p);
}

function withReturnConnection(project: Project): Project {
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((system) => ({
      ...system,
      returnConnection: {
        connectionWidthMm: 600,
        connectionHeightMm: 250,
        dimensionBasis: "ductOpening" as const,
      },
    })),
  };
}

describe("plenum di mandata e plenum di ripresa", () => {
  it("calcola gli stacchi del lato richiesto, senza mescolarli", () => {
    const p = fixture();
    const system = p.hvacSystems[0];
    const supplyIds = new Set(
      p.airTerminals.filter((t) => t.use === "supply").map((t) => t.id),
    );
    const returnIds = new Set(
      p.airTerminals.filter((t) => t.use === "return").map((t) => t.id),
    );
    const supply = calculatePlenum(p, system.id, "supply");
    const returned = calculatePlenum(p, system.id, "return");
    expect(supply.use).toBe("supply");
    expect(returned.use).toBe("return");
    expect(supply.branches.length).toBeGreaterThan(0);
    expect(supply.branches.every((b) => supplyIds.has(b.terminalIds[0]))).toBe(
      true,
    );
    expect(
      returned.branches.every((b) => returnIds.has(b.terminalIds[0])),
    ).toBe(true);
    expect(supply.returnTerminalCount).toBe(returnIds.size);
    expect(returned.supplyAirflowM3h).toBe(supply.supplyAirflowM3h);
  });

  it("crea un plenum per lato e collega le bocchette del lato giusto", () => {
    let p = withReturnConnection(fixture());
    const system = p.hvacSystems[0];
    p = placeSupplyPlenum(p, system.id);
    expect(p.plenums).toHaveLength(1);
    expect(p.plenums[0].use).toBe("supply");
    p = placePlenum(p, system.id, "return");
    expect(p.plenums).toHaveLength(2);
    expect(p.plenums.map((pl) => pl.use).sort()).toEqual(["return", "supply"]);
    const supply = p.plenums.find((pl) => pl.use === "supply")!;
    const returned = p.plenums.find((pl) => pl.use === "return")!;
    for (const terminal of p.airTerminals)
      expect(terminal.plenumId).toBe(
        terminal.use === "supply" ? supply.id : returned.id,
      );
    expect(returned.widthMm).toBeGreaterThan(0);
    expect(returned.depthMm).toBeGreaterThan(0);
    expect(projectSchema.safeParse(p).success).toBe(true);
  });

  it("non crea due plenums dello stesso lato", () => {
    let p = withReturnConnection(fixture());
    const system = p.hvacSystems[0];
    p = placePlenum(p, system.id, "return");
    const again = placePlenum(p, system.id, "return");
    expect(again.plenums).toHaveLength(1);
  });

  it("tiene al massimo due plenums per macchina, con la ripresa facoltativa", () => {
    let p = withReturnConnection(fixture());
    const system = p.hvacSystems[0];
    p = placeSupplyPlenum(p, system.id);
    // La sola mandata è valida: la ripresa non è obbligatoria.
    expect(p.plenums).toHaveLength(1);
    expect(projectSchema.safeParse(p).success).toBe(true);
    p = placePlenum(p, system.id, "return");
    expect(p.plenums).toHaveLength(2);
    expect(placePlenum(p, system.id, "supply").plenums).toHaveLength(2);
    expect(placePlenum(p, system.id, "return").plenums).toHaveLength(2);
    // Un terzo plenum, anche passando da Collega, non entra.
    const machine = p.hvacSystems[0].indoorUnits[0];
    p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
    expect(() => connectPlenum(p, p.plenums.at(-1)!.id, machine.id)).toThrow(
      /già i plenum di mandata e di ripresa/,
    );
  });

  it("conta anche il plenum storico della macchina nel limite dei due lati", () => {
    let p = withReturnConnection(fixture());
    const system = p.hvacSystems[0];
    p = placeSupplyPlenum(p, system.id);
    const legacy = p.plenums[0];
    const machine = p.hvacSystems[0].indoorUnits[0];
    expect(legacy.attachmentId).toBeUndefined();
    p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
    p = connectPlenum(p, p.plenums.at(-1)!.id, machine.id);
    // Il secondo plenum prende il lato libero: ora ci sono mandata e ripresa.
    expect(p.plenums).toHaveLength(2);
    expect(p.plenums.map((pl) => pl.use).sort()).toEqual(["return", "supply"]);
    p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 1 });
    expect(() => connectPlenum(p, p.plenums.at(-1)!.id, machine.id)).toThrow(
      /già i plenum di mandata e di ripresa/,
    );
  });

  it("segnala nei controlli un progetto con più di due plenums macchina", () => {
    const p = withReturnConnection(fixture());
    const system = p.hvacSystems[0];
    const base = placeSupplyPlenum(p, system.id);
    const machine = base.hvacSystems[0].indoorUnits[0];
    const template = base.plenums[0];
    const broken = {
      ...base,
      plenums: [
        ...base.plenums,
        { ...template, id: "extra-supply", attachmentId: machine.id },
        {
          ...template,
          id: "extra-return",
          attachmentId: machine.id,
          use: "return" as const,
        },
      ],
    };
    expect(validateProject(broken)).toContainEqual(
      expect.objectContaining({
        code: "machinePlenums",
        status: "invalid",
      }),
    );
  });

  it("senza raccordo di ripresa dichiarato non inventa la geometria", () => {
    const p = fixture();
    const system = p.hvacSystems[0];
    expect(() => placePlenum(p, system.id, "return")).toThrow(
      /raccordo di ripresa/i,
    );
    expect(
      calculatePlenum(p, system.id, "return").machineGeometry?.bodyWidthMm,
    ).toBeNull();
  });
});
