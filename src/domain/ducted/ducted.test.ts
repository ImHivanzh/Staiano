import { describe, it, expect } from "vitest";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
import { createProject, addRectangle } from "@/domain/project";
import {
  applyDuctedSystem,
  ductedRoomAllocation,
  removeHvacSystem,
} from "./apply";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { decodeProject, encodeProject } from "@/services/project/format";
import { refreshDuctedBindings } from "./refresh";
import { updateRoom, addWall, moveWall } from "@/domain/project";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { sizeRadiators } from "@/domain/radiators/size";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { projectSchema } from "@/schemas/project";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { validateProject } from "@/domain/validation";
describe("canalizzato, portate e terminali persistenti", () => {
  it("new systems, geometry refresh and legacy reload always use maximum flow", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    const room = p.rooms[0];
    p = applyDuctedSystem(p, [room.id], "Mitsubishi Electric", null);
    expect(p.hvacSystems[0].airflowM3h).toBe(840);
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EDLS",
    )!;
    p = applyAirTerminalSolution(
      p,
      room.id,
      p.hvacSystems[0].id,
      "supply",
      family.familyCode,
      sizeAirTerminal(720, 1, family, "supply")[0],
      "ceiling",
    );
    const originals = structuredClone(p.airTerminals);
    p.hvacSystems[0].airflowM3h = 720;
    expect(ductedRoomAllocation(p, room.id)?.airflowM3h).toBe(840);
    expect(
      validateProject(p).find((c) => c.code === "machineAirflow")?.status,
    ).toBe("invalid");
    p = decodeProject(JSON.stringify(p));
    expect(p.hvacSystems[0].airflowM3h).toBe(840);
    expect(
      p.airTerminals.reduce((sum, t) => sum + t.requiredAirflowM3h, 0),
    ).toBe(840);
    for (const [index, terminal] of p.airTerminals.entries()) {
      expect({
        ...terminal,
        requiredAirflowM3h: originals[index].requiredAirflowM3h,
      }).toEqual(originals[index]);
    }
    expect(
      validateProject(p).find((c) => c.code === "supplyAirflow")?.status,
    ).toBe("invalid");
    p = refreshDuctedBindings(updateRoom(p, room.id, { heightM: 4 }));
    const machine = hvacCatalog.products.find(
      (m) => m.id === p.hvacSystems[0].productId,
    )!;
    expect(p.hvacSystems[0].airflowM3h).toBe(
      maximumAirflowOption(machine)!.airflowM3h,
    );
    p.hvacSystems[0].catalogVersion = "missing-historical-revision";
    const unknown = refreshDuctedBindings(p);
    expect(unknown.hvacSystems[0].compatibilityStatus).toBe("unverifiable");
    expect(unknown.airTerminals).toEqual(p.airTerminals);
    expect(ductedRoomAllocation(unknown, room.id)).toBeNull();
  });
  it("unequal room fractions conserve each independent machine's maximum", () => {
    for (const flow of [840, 900, 600]) {
      const allocations = distributeAirflow(
        [
          { id: "a", designLoadW: 1103, supplyPoints: 3, returnPoints: 2 },
          { id: "b", designLoadW: 2377, supplyPoints: 2, returnPoints: 3 },
          { id: "c", designLoadW: 1739, supplyPoints: 1, returnPoints: 1 },
        ],
        flow,
      );
      expect(allocations.reduce((sum, r) => sum + r.airflowM3h, 0)).toBe(flow);
      expect(allocations[0].supplyAirflowPerPointM3h).toBe(
        allocations[0].airflowM3h / 3,
      );
      expect(allocations[1].returnAirflowPerPointM3h).toBe(
        allocations[1].airflowM3h / 3,
      );
    }
  });
  it("supply and return physical units conserve maximum flow in two autonomous zones", () => {
    let p = createProject();
    for (const [name, width, length] of [
      ["Giorno A", 4, 3],
      ["Giorno B", 3.7, 3.1],
      ["Notte A", 3.9, 3.3],
      ["Notte B", 4.1, 2.9],
    ] as const)
      p = addRectangle(p, p.floors[0].id, { name, width, length, height: 2.7 });
    p = applyDuctedSystem(
      p,
      p.rooms.slice(0, 2).map((r) => r.id),
      "Mitsubishi Electric",
      null,
    );
    p = applyDuctedSystem(
      p,
      p.rooms.slice(2).map((r) => r.id),
      "Gree",
      null,
    );
    for (const room of p.rooms) {
      const allocation = ductedRoomAllocation(p, room.id)!;
      for (const use of ["supply", "return"] as const) {
        const family = airTerminalCatalog.families.find(
          (f) => f.familyCode === (use === "supply" ? "EDLS" : "EGQ"),
        )!;
        p = applyAirTerminalSolution(
          p,
          room.id,
          allocation.system.id,
          use,
          family.familyCode,
          sizeAirTerminal(
            allocation.airflowM3h,
            use === "supply" ? 3 : 2,
            family,
            use,
          )[0],
          family.mountings!.includes("ceiling") ? "ceiling" : "wall",
        );
      }
    }
    p = decodeProject(encodeProject(refreshDuctedBindings(p)));
    expect(p.hvacSystems.map((s) => s.airflowM3h)).toEqual([840, 600]);
    for (const system of p.hvacSystems)
      for (const use of ["supply", "return"] as const)
        expect(
          p.airTerminals
            .filter((t) => t.systemId === system.id && t.use === use)
            .reduce((sum, t) => sum + t.requiredAirflowM3h, 0),
        ).toBe(system.airflowM3h);
    const untouched = structuredClone(p.hvacSystems[1]);
    const untouchedTerminals = structuredClone(
      p.airTerminals.filter((t) => t.systemId === untouched.id),
    );
    p = refreshDuctedBindings(updateRoom(p, p.rooms[0].id, { heightM: 4 }));
    expect(p.hvacSystems[1]).toEqual(untouched);
    expect(p.airTerminals.filter((t) => t.systemId === untouched.id)).toEqual(
      untouchedTerminals,
    );
  });
  it("two autonomous ducted systems keep machine, rooms and terminals independent through edits, export and deletion", () => {
    let p = createProject();
    for (const name of ["Zona giorno", "Zona notte"])
      p = addRectangle(p, p.floors[0].id, {
        width: 4.2,
        length: 3.8,
        height: 2.7,
        name,
      });
    const [day, night] = p.rooms;
    p = applyDuctedSystem(p, [day.id], "Mitsubishi Electric", null);
    p = applyDuctedSystem(p, [night.id], "Daikin", null);
    const first = ductedRoomAllocation(p, day.id)!,
      second = ductedRoomAllocation(p, night.id)!;
    p.hvacSystems = p.hvacSystems.map((s) => ({
      ...s,
      name: s.id === first.system.id ? "Giorno autonomo" : "Notte autonoma",
    }));
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EDLS",
    )!;
    for (const room of [day, night]) {
      const a = ductedRoomAllocation(p, room.id)!;
      p = applyAirTerminalSolution(
        p,
        room.id,
        a.system.id,
        "supply",
        family.familyCode,
        sizeAirTerminal(a.airflowM3h, room.supplyPoints, family, "supply")[0],
        "ceiling",
      );
    }
    const untouched = structuredClone(
      p.hvacSystems.find((s) => s.id === second.system.id),
    );
    const untouchedTerminals = structuredClone(
      p.airTerminals.filter((t) => t.systemId === second.system.id),
    );
    p = refreshDuctedBindings(updateRoom(p, day.id, { heightM: 3.5 }));
    expect(p.hvacSystems.find((s) => s.id === second.system.id)).toEqual(
      untouched,
    );
    expect(
      p.airTerminals.filter((t) => t.systemId === second.system.id),
    ).toEqual(untouchedTerminals);
    expect(() =>
      applyDuctedSystem(p, [night.id], "Gree", first.system.id),
    ).toThrow(/altro sistema/);
    const restored = decodeProject(encodeProject(p));
    expect(restored.hvacSystems.map((s) => s.name)).toEqual(
      p.hvacSystems.map((s) => s.name),
    );
    const removed = removeHvacSystem(restored, first.system.id);
    expect(removed.hvacSystems).toMatchObject([untouched]);
    expect(removed.airTerminals).toEqual(untouchedTerminals);
    expect(ductedRoomAllocation(removed, night.id)?.airflowM3h).toBe(
      second.airflowM3h,
    );
  });
  it("Daikin FBA71–140: merged cells from official PDF p.90", () => {
    const machine = selectDuctedMachine(
      7000,
      "Daikin",
      hvacCatalog.products,
    )[0];
    expect(machine.indoorModel).toBe("FBA100A");
    expect(machine.coolingCapacityW).toBe(9500);
    expect(machine.airflowOptions[1].airflowM3h).toBe(1560);
    expect(machine.staticPressurePa).toBe(40);
    for (const model of ["FBA125A", "FBA140A"]) {
      const product = hvacCatalog.products.find(
        (p) => p.indoorModel === model,
      )!;
      expect([product.widthMm, product.heightMm, product.depthMm]).toEqual([
        1400, 245, 800,
      ]);
      expect(product.airflowOptions.map((f) => f.airflowM3h)).toEqual([
        1410, 1740, 2040,
      ]);
      expect(product.staticPressurePa).toBe(50);
      expect(product.sourceMetadata.page).toBe(90);
    }
  });
  it("preserva apparecchi e associazioni quando una stanza servita è divisa", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    const r = p.rooms[0];
    p = applyDuctedSystem(p, [r.id], "Mitsubishi Electric", null);
    const a = ductedRoomAllocation(p, r.id)!,
      f = airTerminalCatalog.families[0],
      s = sizeAirTerminal(a.airflowM3h, 2, f, "supply")[0];
    p = applyAirTerminalSolution(
      p,
      r.id,
      a.system.id,
      "supply",
      f.familyCode,
      s,
      "ceiling",
    );
    p = addWall(p, r.floorId, { x: 2, y: 0 }, { x: 2, y: 4.1 });
    expect(p.rooms).toHaveLength(2);
    expect(p.hvacSystems[0].roomIds).toHaveLength(2);
    expect(p.airTerminals).toHaveLength(2);
    expect(() => projectSchema.parse(p)).not.toThrow();
  });
  it("il radiatore segue la parete trascinata mantenendo ID e catalogo", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 5,
      length: 4,
      height: 2.7,
      name: "Camera",
    });
    const r = p.rooms[0],
      wall = p.walls[0];
    const solution = sizeRadiators(
      r.designLoadW,
      radiatorProducts.filter((v) => v.id === "global-vip-600"),
      50,
      { manufacturer: "Global", family: "VIP", numberOfRadiators: 1 },
    )[0];
    p = applyRadiatorSolution(p, r.id, solution, wall.id);
    const old = p.radiators[0];
    p = moveWall(p, wall.id, { x: 0, y: -0.5 });
    expect(p.radiators[0].id).toBe(old.id);
    expect(p.radiators[0].position.y).toBeCloseTo(old.position.y - 0.5);
    expect(p.radiators[0].productId).toBe(old.productId);
  });
  it("regressione Daikin e Gree: portate originali e capacità di catalogo", () => {
    const d = hvacCatalog.products.find((p) => p.indoorModel === "FBA35A9")!,
      g = hvacCatalog.products.find((p) => p.indoorModel === "GUD35PS1/A-S")!;
    expect(d.coolingCapacityW).toBe(3400);
    expect(d.airflowOptions[1].airflowM3h).toBe(750);
    expect(g.coolingCapacityW).toBe(3500);
    expect(g.heatingCapacityW).toBe(4000);
    expect(g.airflowOptions[2].airflowM3h).toBe(500);
    expect(g.staticPressurePa).toBe(25);
  });
  it("altezza aggiorna quota soffitto e domanda senza cambiare stile", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera",
    });
    const r = p.rooms[0];
    p = applyDuctedSystem(p, [r.id], "Mitsubishi Electric", null);
    const a = ductedRoomAllocation(p, r.id)!,
      f = airTerminalCatalog.families[0],
      s = sizeAirTerminal(a.airflowM3h, 2, f, "supply")[0];
    p = applyAirTerminalSolution(
      p,
      r.id,
      a.system.id,
      "supply",
      f.familyCode,
      s,
      "ceiling",
    );
    const ids = p.airTerminals.map((t) => t.id);
    p = refreshDuctedBindings(updateRoom(p, r.id, { heightM: 3 }));
    expect(p.airTerminals.every((t) => t.elevationM === 3)).toBe(true);
    expect(p.airTerminals.map((t) => t.id)).toEqual(ids);
    expect(p.airTerminals.every((t) => t.family === "EDLS")).toBe(true);
  });
  it("PEAD-M35JA2:3600W/4100W,media720m³/h e50Pa", () => {
    const m = hvacCatalog.products.find(
      (p) => p.indoorModel === "PEAD-M35JA2",
    )!;
    expect(m.coolingCapacityW).toBe(3600);
    expect(m.heatingCapacityW).toBe(4100);
    expect(m.airflowOptions[m.defaultAirflowIndex!].airflowM3h).toBe(720);
    expect(m.staticPressurePa).toBe(50);
    expect(
      selectDuctedMachine(4000, "Mitsubishi Electric", hvacCatalog.products)[0]
        .indoorModel,
    ).toBe("PEAD-M50JA2");
  });
  it("distribuisce1200 in proporzione3.5/7,senza arrotondamenti", () => {
    const result = distributeAirflow(
      [
        { id: "a", designLoadW: 3500, supplyPoints: 2, returnPoints: 1 },
        { id: "b", designLoadW: 3500, supplyPoints: 1, returnPoints: 1 },
      ],
      1200,
    );
    expect(result[0].airflowM3h).toBe(600);
    expect(result[0].supplyAirflowPerPointM3h).toBe(300);
    expect(result.reduce((n, r) => n + r.airflowM3h, 0)).toBe(1200);
    expect(() => distributeAirflow([], 1200)).toThrow();
  });
  it("salva e ricarica macchina e terminali,con geometria originale", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Soggiorno",
    });
    const room = p.rooms[0];
    p = applyDuctedSystem(p, [room.id], "Mitsubishi Electric", null);
    const allocation = ductedRoomAllocation(p, room.id)!;
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EDLS",
    )!;
    const solution = sizeAirTerminal(
      allocation.airflowM3h,
      2,
      family,
      "supply",
    )[0];
    p = applyAirTerminalSolution(
      p,
      room.id,
      allocation.system.id,
      "supply",
      family.familyCode,
      solution,
      "ceiling",
    );
    expect(p.airTerminals).toHaveLength(2);
    expect(p.airTerminals[0].depthMm).toBe(60);
    const restored = decodeProject(encodeProject(p));
    expect(restored.schemaVersion).toBe(5);
    expect(restored.hvacSystems).toHaveLength(1);
    expect(restored.airTerminals).toHaveLength(2);
    expect(
      restored.airTerminals.reduce((n, t) => n + t.requiredAirflowM3h, 0),
    ).toBeCloseTo(840);
  });
  it("rifiuta montaggio incompatibile e scala non verificata", () => {
    let p = createProject();
    p = addRectangle(p, p.floors[0].id, {
      width: 4,
      height: 2.7,
      length: 4,
      name: "Camera",
    });
    const f = airTerminalCatalog.families[0],
      s = sizeAirTerminal(300, 1, f, "supply")[0];
    expect(() =>
      applyAirTerminalSolution(
        p,
        p.rooms[0].id,
        null,
        "supply",
        f.familyCode,
        s,
        "wall",
      ),
    ).toThrow();
    p.floors[0].scaleVerified = false;
    expect(() =>
      applyDuctedSystem(p, [p.rooms[0].id], "Mitsubishi Electric", null),
    ).toThrow();
  });
});
