import { describe, it, expect } from "vitest";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
import { createProject, addRectangle } from "@/domain/project";
import { applyDuctedSystem, ductedRoomAllocation } from "./apply";
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
describe("canalizzato, portate e terminali persistenti", () => {
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
    expect(restored.schemaVersion).toBe(2);
    expect(restored.hvacSystems).toHaveLength(1);
    expect(restored.airTerminals).toHaveLength(2);
    expect(
      restored.airTerminals.reduce((n, t) => n + t.requiredAirflowM3h, 0),
    ).toBeCloseTo(720);
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
