import { describe, expect, it } from "vitest";
import type { Project } from "@/schemas/project";
import { createProject, addRectangle, updateRoom } from "@/domain/project";
import { applyDuctedSystem, ductedRoomAllocation } from "./apply";
import { refreshDuctedBindings } from "./refresh";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { encodeProject, decodeProject } from "@/services/project/format";
import {
  calculateSupplyPlenum,
  sizeCircularBranch,
  PLENUM_DIAMETERS_MM,
} from "./plenum";

function terminals(
  project: Project,
  roomId: string,
  use: "supply" | "return",
  points = 2,
  code?: string,
) {
  const allocation = ductedRoomAllocation(project, roomId)!;
  const family = airTerminalCatalog.families.find(
    (f) => f.familyCode === (code ?? (use === "supply" ? "EDLS" : "EGQ")),
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
function fixture(complete = true) {
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
  if (complete) p = terminals(p, room.id, "return", 1);
  return refreshDuctedBindings(p);
}

describe("plenum di mandata indipendente e verificabile", () => {
  it("SI: 360 m³/h a 2,5 m/s richiede almeno 225,676 mm, Ø250 commerciale", () => {
    const result = sizeCircularBranch(360, 2.5)!;
    expect(result.minimumDiameterMm).toBeCloseTo(225.6758334, 6);
    expect(result.diameterMm).toBe(250);
    expect(result.velocityMs).toBeCloseTo(2.0371832716, 8);
    expect(result.velocityMs).toBeLessThanOrEqual(2.5);
  });
  it("usa ogni misura commerciale disponibile; ai confini non arrotonda sotto soglia", () => {
    for (const diameter of PLENUM_DIAMETERS_MM) {
      const flow = (3600 * 2.5 * Math.PI * (diameter / 1000) ** 2) / 4;
      expect(sizeCircularBranch(flow, 2.5)?.diameterMm).toBe(diameter);
      const above = sizeCircularBranch(flow * 1.000001, 2.5)!;
      expect(above.diameterMm === null || above.diameterMm > diameter).toBe(
        true,
      );
    }
    const aboveRange = sizeCircularBranch(100000, 0.5)!;
    expect(aboveRange.diameterMm).toBeNull();
    expect(aboveRange.velocityMs).toBeNull();
  });
  it("rifiuta portate e velocità non positive/non finite", () => {
    for (const value of [0, -1, Infinity, NaN]) {
      expect(sizeCircularBranch(value, 2.5)).toBeNull();
      expect(sizeCircularBranch(100, value)).toBeNull();
    }
  });
  it("due mandata EDLS hanno quattro stacchi Ø198 da scheda, a 210 m³/h; ripresa separata", () => {
    const p = fixture(),
      system = p.hvacSystems[0];
    const result = calculateSupplyPlenum(p, system.id);
    expect(result.status).toBe("ready");
    expect(result.machineAirflowM3h).toBe(840);
    expect(result.branches).toHaveLength(4);
    expect(result.groupedDiameters).toEqual([{ diameterMm: 198, quantity: 4 }]);
    expect(
      result.branches.every(
        (b) =>
          b.airflowM3h === 210 &&
          b.verified &&
          b.plenumModelCode &&
          b.connectionSource,
      ),
    ).toBe(true);
    expect(result.supplyAirflowM3h).toBe(840);
    expect(result.returnAirflowM3h).toBe(840);
    expect(result.returnTerminalCount).toBeGreaterThan(0);
    const supplyIds = p.airTerminals
      .filter((t) => t.use === "supply")
      .map((t) => t.id);
    expect([...new Set(result.branches.flatMap((b) => b.terminalIds))]).toEqual(
      supplyIds,
    );
    expect(result.issues).toEqual([]);
  });
  it("ripresa mancante non altera i diametri della mandata, resta da completare", () => {
    const p = fixture(false),
      result = calculateSupplyPlenum(p, p.hvacSystems[0].id);
    expect(result.status).toBe("pending");
    expect(result.supplyComplete).toBe(true);
    expect(result.returnComplete).toBe(false);
    expect(result.pendingReturnPoints).toHaveLength(1);
    expect(result.groupedDiameters).toEqual([{ diameterMm: 198, quantity: 4 }]);
  });
  it("una velocità proposta diversa modifica solo il minimo teorico, mai gli attacchi reali", () => {
    const p = fixture();
    const systemId = p.hvacSystems[0].id;
    const slow = calculateSupplyPlenum(p, systemId, {
      maxBranchVelocityMs: 0.5,
      grouping: "point",
    });
    const fast = calculateSupplyPlenum(p, systemId, {
      maxBranchVelocityMs: 10,
      grouping: "terminal",
    });
    expect(slow.branches).toHaveLength(4);
    expect(fast.branches).toHaveLength(4);
    expect(
      slow.branches.map((branch) => [
        branch.id,
        branch.diameterMm,
        branch.velocityMs,
      ]),
    ).toEqual(
      fast.branches.map((branch) => [
        branch.id,
        branch.diameterMm,
        branch.velocityMs,
      ]),
    );
    expect(
      slow.branches.every(
        (branch, i) =>
          branch.minimumDiameterMm! > fast.branches[i].minimumDiameterMm!,
      ),
    ).toBe(true);
    expect(slow.machineGeometry?.ports.map((port) => port.number)).toEqual([
      1, 2, 3, 4,
    ]);
  });
  it("punti previsti privi di bocchetta non diventano stacchi installati", () => {
    const p = fixture();
    p.airTerminals = p.airTerminals.filter(
      (t) => t.use !== "supply" || t.pointIndex !== 1,
    );
    const result = calculateSupplyPlenum(p, p.hvacSystems[0].id);
    expect(result.status).toBe("pending");
    expect(result.branches).toHaveLength(2);
    expect(result.pendingSupplyPoints).toEqual([
      { roomId: p.rooms[0].id, roomName: "Camera", pointIndex: 1 },
    ]);
    expect(result.supplyAirflowM3h).toBe(420);
    expect(result.supplyComplete).toBe(false);
  });
  it("gli attacchi di catalogo restano separati anche se un vecchio progetto raggruppava i punti", () => {
    let p = fixture();
    p = terminals(p, p.rooms[0].id, "supply", 1, "EVVMC");
    p = refreshDuctedBindings(p);
    const physical = p.airTerminals.filter((t) => t.use === "supply");
    expect(physical.length).toBeGreaterThan(1);
    const separate = calculateSupplyPlenum(p, p.hvacSystems[0].id);
    expect(separate.branches).toHaveLength(physical.length);
    expect(separate.supplyAirflowM3h).toBeCloseTo(840);
    expect(
      separate.branches.every(
        (b) =>
          b.velocityMs ===
          b.airflowM3h / 3600 / ((Math.PI * (b.diameterMm! / 1000) ** 2) / 4),
      ),
    ).toBe(true);
    const grouped = calculateSupplyPlenum(p, p.hvacSystems[0].id, {
      grouping: "point",
      maxBranchVelocityMs: 2.5,
    });
    expect(grouped.branches).toEqual(separate.branches);
    expect(
      grouped.branches.reduce((sum, b) => sum + b.airflowM3h, 0),
    ).toBeCloseTo(840);
    expect(grouped.status).toBe("ready");
  });
  it("due macchine autonome non condividono stacchi, portate o impostazioni", () => {
    let p = fixture();
    const first = p.hvacSystems[0].id;
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Studio",
    });
    const otherRoom = p.rooms.find((r) => r.name === "Studio")!;
    p = applyDuctedSystem(p, [otherRoom.id], "Daikin", null);
    const second = p.hvacSystems.find((s) => s.id !== first)!;
    second.plenumSettings = { maxBranchVelocityMs: 4, grouping: "terminal" };
    p = terminals(p, otherRoom.id, "supply", 3);
    p = terminals(p, otherRoom.id, "return", 1);
    p = refreshDuctedBindings(p);
    const a = calculateSupplyPlenum(p, first),
      b = calculateSupplyPlenum(p, second.id);
    expect(a.branches).toHaveLength(4);
    expect(a.machineAirflowM3h).toBe(840);
    expect(b.branches).toHaveLength(6);
    expect(b.machineAirflowM3h).toBe(900);
    expect(b.settings.maxBranchVelocityMs).toBe(4);
    expect(a.settings.maxBranchVelocityMs).toBe(2.5);
    expect(b.supplyAirflowM3h).toBeCloseTo(900);
    expect(b.status).toBe("ready");
    expect(b.branches.every((branch) => branch.roomId === otherRoom.id)).toBe(
      true,
    );
  });
  it("non inventa diametri definitivi per legacy, cataloghi ignoti o rumore manomesso", () => {
    for (const patch of [
      { legacyUnverified: true },
      { operatingPointIndex: null },
      { catalogVersion: "non-esistente" },
      { noiseDbA: 99 },
      { requiredAirflowM3h: 9999 },
      { pointIndex: 99 },
    ]) {
      const p = fixture(),
        terminal = p.airTerminals.find((t) => t.use === "supply")!;
      Object.assign(terminal, patch);
      const result = calculateSupplyPlenum(p, p.hvacSystems[0].id);
      expect(result.status).toBe("pending");
      expect(
        result.branches.find((b) => b.terminalIds.includes(terminal.id))
          ?.diameterMm,
      ).toBeNull();
    }
  });
  it("profondità corpo non dichiarata non impedisce il diametro aeraulico", () => {
    const p = fixture();
    p.airTerminals.forEach((t) => {
      t.depthMm = null;
    });
    expect(calculateSupplyPlenum(p, p.hvacSystems[0].id).status).toBe("ready");
  });
  it("indici unità duplicati e somme incongruenti restano non verificati", () => {
    const p = fixture(),
      original = p.airTerminals.find((t) => t.use === "supply")!;
    p.airTerminals.push({ ...original, id: "duplicate-unit" });
    const result = calculateSupplyPlenum(p, p.hvacSystems[0].id);
    expect(result.supplyComplete).toBe(false);
    expect(
      result.branches
        .filter((b) => b.pointIndex === original.pointIndex)
        .every((b) => b.diameterMm === null),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.code === "supplyBalance")).toBe(
      true,
    );
  });
  it("variazione domanda aggiorna la macchina automatica e richiede conferma terminali insufficienti", () => {
    let p = fixture();
    p.hvacSystems[0].decisionOrigin = "calculated";
    p = refreshDuctedBindings(updateRoom(p, p.rooms[0].id, { heightM: 8 }));
    const result = calculateSupplyPlenum(p, p.hvacSystems[0].id);
    expect(result.machineAirflowM3h).toBeGreaterThan(840);
    expect(result.supplyAirflowM3h).toBeCloseTo(result.machineAirflowM3h!);
    expect(result.status).toBe("pending");
    expect(
      result.issues.some((issue) => issue.code === "terminalUnverified"),
    ).toBe(true);
  });
  it("impostazioni e risultato sopravvivono al salvataggio, vecchi progetti usano default", () => {
    const p = fixture(),
      id = p.hvacSystems[0].id;
    p.hvacSystems[0].plenumSettings = {
      maxBranchVelocityMs: 3,
      grouping: "point",
    };
    const roundtrip = decodeProject(encodeProject(p));
    expect(calculateSupplyPlenum(roundtrip, id)).toEqual(
      calculateSupplyPlenum(p, id),
    );
    delete p.hvacSystems[0].plenumSettings;
    expect(
      calculateSupplyPlenum(decodeProject(encodeProject(p)), id).settings,
    ).toEqual({ maxBranchVelocityMs: 2.5, grouping: "terminal" });
  });
  it("rifiuta macchina non verificata, scala assente e criteri corrotti", () => {
    const p = fixture(),
      id = p.hvacSystems[0].id;
    expect(calculateSupplyPlenum(p, "missing").status).toBe("unavailable");
    expect(
      calculateSupplyPlenum(p, id, {
        maxBranchVelocityMs: 0,
        grouping: "terminal",
      }).status,
    ).toBe("unavailable");
    p.hvacSystems[0].airflowM3h = Infinity;
    expect(calculateSupplyPlenum(p, id).status).toBe("unavailable");
    p.hvacSystems[0].airflowM3h = 840;
    p.floors[0].scaleVerified = false;
    expect(calculateSupplyPlenum(p, id).status).toBe("unavailable");
  });
});
