import { describe, it, expect } from "vitest";
import {
  createProject,
  addRectangle,
  updateRoom,
  moveWall,
} from "@/domain/project";
import { splitCatalog } from "@/domain/catalogs/splits";
import { splitCatalogSchema } from "@/domain/catalogs/split-schema";
import { projectSchema } from "@/schemas/project";
import { applySplitSystem } from "./apply";
import { sizeSplitSystems } from "./size";
import { validateSplitSystem } from "./validate";
import { refreshSplitBindings } from "./refresh";
import { movePlacedDevice } from "@/domain/geometry/move-device";
import { pointInPolygon } from "@/domain/geometry/primitives";
import { encodeProject, decodeProject } from "@/services/project/format";
import { refrigerantRoute } from "./outdoor";
function fixture() {
  let p = createProject();
  p = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera1",
  });
  return p;
}
describe("split con combinazioni originali", () => {
  it("salva l'unità esterna fuori dagli ambienti e traccia il refrigerante", () => {
    let p = fixture();
    p = applySplitSystem(p, [p.rooms[0].id], "Daikin", null);
    const system = p.hvacSystems[0],
      outdoor = system.outdoorUnit;
    expect(outdoor).not.toBeNull();
    expect(outdoor!.widthMm).toBeGreaterThan(0);
    expect(
      p.rooms.some((room) =>
        pointInPolygon(outdoor!.position, room.polygon),
      ),
    ).toBe(false);
    expect(
      refrigerantRoute(p, system, system.indoorUnits[0].id).length,
    ).toBeGreaterThanOrEqual(2);
  });
  it("scala non verificata blocca selezione split senza perdere la configurazione salvata", () => {
    let p = fixture();
    p = applySplitSystem(p, [p.rooms[0].id], "Daikin", null);
    const saved = structuredClone(p.hvacSystems[0]);
    p.floors[0].scaleVerified = false;
    expect(
      sizeSplitSystems(p, [p.rooms[0].id], "Daikin", splitCatalog),
    ).toEqual([]);
    const refreshed = refreshSplitBindings(p);
    expect(refreshed.hvacSystems[0].compatibilityStatus).toBe("invalid");
    expect(refreshed.hvacSystems[0].indoorUnits).toEqual(saved.indoorUnits);
  });
  it.each(["Daikin", "Mitsubishi Electric", "Gree"])(
    "%s: combinazione per due locali verificata e conservata al reload",
    (manufacturer) => {
      let p = fixture();
      p = addRectangle(p, p.floors[0].id, {
        width: 4,
        length: 3.5,
        height: 2.7,
        name: "Camera2",
      });
      const solution = sizeSplitSystems(
        p,
        p.rooms.map((r) => r.id),
        manufacturer,
        splitCatalog,
      )[0];
      expect(solution).toBeDefined();
      expect(solution.combination.mode).toBe("multi");
      expect(solution.combination.approved).toBe(true);
      p = applySplitSystem(
        p,
        p.rooms.map((r) => r.id),
        manufacturer,
        null,
      );
      expect(p.hvacSystems[0].indoorUnits).toHaveLength(2);
      expect(
        validateSplitSystem(p, p.hvacSystems[0]).filter(
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
    },
  );
  it("Daikin20+25 usa1.78/2.22kW simultanei, non2/2.5nominali", () => {
    const c = splitCatalog.combinations.find(
      (c) =>
        c.outdoorModel === "2MXM40A9" &&
        c.indoorProductIds.join() === "daikin-ftxm20a,daikin-ftxm25a",
    )!;
    expect(c.indoorCoolingW).toEqual([1780, 2220]);
    expect(c.coolingCapacityW).toBe(4000);
    expect(c.indoorHeatingW).toEqual([1870, 2330]);
  });
  it("GreeGWHD14 9+12 ripartizione ufficiale per locale", () => {
    const c = splitCatalog.combinations.find(
      (c) =>
        c.mode === "multi" &&
        c.manufacturer === "Gree" &&
        c.outdoorModel.includes("14") &&
        c.indoorProductIds.join() === "gree-pular-09,gree-pular-12",
    )!;
    expect(c.indoorCoolingW).toEqual([1760, 2340]);
    expect(c.indoorHeatingW).toEqual([1890, 2510]);
  });
  it.each(["Daikin", "Gree", "Mitsubishi Electric"])(
    "%s mono salva e ricarica con ID e posa invariati",
    (brand) => {
      let p = fixture();
      p = applySplitSystem(p, [p.rooms[0].id], brand, null);
      expect(projectSchema.safeParse(p).success).toBe(true);
      const system = p.hvacSystems[0],
        unit = system.indoorUnits[0],
        loaded = refreshSplitBindings(decodeProject(encodeProject(p)));
      expect(loaded.hvacSystems[0].indoorUnits[0]).toEqual(unit);
      expect(
        validateSplitSystem(loaded, loaded.hvacSystems[0]).filter(
          (c) => c.status === "invalid",
        ),
      ).toEqual([]);
    },
  );
  it("esclude matrice insufficiente in una stanza pur con potenza totale sufficiente", () => {
    let p = fixture();
    p = addRectangle(p, p.floors[0].id, {
      width: 4.2,
      length: 3.8,
      height: 2.7,
      name: "Camera2",
    });
    p.rooms.forEach((r) => (r.designLoadW = 2100));
    const solutions = sizeSplitSystems(
      p,
      p.rooms.map((r) => r.id),
      "Daikin",
      splitCatalog,
    );
    expect(solutions.length).toBeGreaterThan(0);
    expect(
      solutions.every((s) =>
        s.assignments.every((a) => a.coolingW >= 2100 && a.heatingW >= 2100),
      ),
    ).toBe(true);
    expect(
      solutions.some((s) => s.combination.outdoorModel === "2MXM40A9"),
    ).toBe(false);
  });
  it("capacità mancante o non approvata non crea falsa compatibilità", () => {
    const p = fixture(),
      catalog = structuredClone(splitCatalog);
    catalog.combinations.forEach(
      (c) => (c.indoorCoolingW = c.indoorCoolingW.map(() => null)),
    );
    expect(sizeSplitSystems(p, [p.rooms[0].id], "Daikin", catalog)).toEqual([]);
    expect(() =>
      splitCatalogSchema.parse({
        ...splitCatalog,
        combinations: [{ ...splitCatalog.combinations[0], indoorCoolingW: [] }],
      }),
    ).toThrow();
  });
  it("rename e incremento altezza preservano modello confermato e segnalano capacità insufficiente", () => {
    let p = fixture();
    p = applySplitSystem(p, [p.rooms[0].id], "Daikin", null);
    const old = p.hvacSystems[0].indoorUnits[0];
    p = refreshSplitBindings(
      updateRoom(p, p.rooms[0].id, { name: "Studio", heightM: 4 }),
    );
    const current = p.hvacSystems[0].indoorUnits[0];
    expect(current.id).toBe(old.id);
    expect(current.wallId).toBe(old.wallId);
    expect(current.position).toEqual(old.position);
    expect(current.productId).toBe(old.productId);
    expect(p.hvacSystems[0].capacityW).toBeLessThan(p.rooms[0].designLoadW);
    expect(p.hvacSystems[0].compatibilityStatus).toBe("invalid");
  });
  it("spostamento parete e cambio stanza mantengono identità unità", () => {
    let p = fixture();
    p = addRectangle(p, p.floors[0].id, {
      width: 4,
      length: 3,
      height: 2.7,
      name: "Camera2",
    });
    const first = p.rooms[0],
      second = p.rooms[1];
    p = applySplitSystem(p, [first.id], "Daikin", null);
    let old = p.hvacSystems[0].indoorUnits[0];
    const delta = { x: 0, y: -0.4 };
    p = refreshSplitBindings(moveWall(p, old.wallId!, delta));
    expect(p.hvacSystems[0].indoorUnits[0].id).toBe(old.id);
    old = p.hvacSystems[0].indoorUnits[0];
    p = refreshSplitBindings(movePlacedDevice(p, old.id, second.centroid));
    expect(p.hvacSystems[0].indoorUnits[0].id).toBe(old.id);
    expect(p.hvacSystems[0].roomIds).toEqual([second.id]);
    expect(p.hvacSystems[0].indoorUnits[0].roomId).toBe(second.id);
  });
});
