import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../tests/guided-fixture";
import { addRectangle, recomputeProject } from "./project";
import { editOperatorTerminal } from "./air-terminals/operator";
import { systemLinearBalances } from "./air-terminals/linear-meters";
import { applyDuctedSystem } from "./ducted/apply";
import { refreshDuctedBindings } from "./ducted/refresh";
import { airTerminalCatalog } from "./catalogs/air-terminals";
import { sizeAirTerminal } from "./air-terminals/size";
import { applyAirTerminalSolution } from "./air-terminals/apply";
import { calculateSupplyPlenum } from "./ducted/plenum";
import {
  placeSupplyPlenum,
  placedPlenumGeometry,
  moveSystemObject,
} from "./ducted/placement";
import {
  addDuctWaypoint,
  ductRoute,
  generateDuctRoutes,
  plenumLocalToPlan,
  removeDuctWaypoint,
  setDuctKind,
} from "./ducted/routes";
import { plenumTechnicalDrawing } from "./ducted/technical-view";
import { layoutFromMachineGeometry } from "../configurator/viewer3d/plenum-layout";
import { addPillar, pillarFootprint } from "./geometry/pillars";
import { addTerminalPlenum } from "./ducted/attached-plenums";
import { validateProject } from "./validation";
import { useProjectStore } from "../stores/project-store";
import {
  decodeProject,
  encodeProject,
  parseProject,
} from "../services/project/format";
import { IndexedDbProjectRepository } from "../services/project/repository";

describe("operator-led configuration acceptance", () => {
  it("4.2 required meters never create a vent; four chosen pieces total 4.6 m", () => {
    let p = guidedProjectFixture();
    expect(p.airTerminals).toHaveLength(0);
    expect(p.hvacSystems[0].linearPlan?.requiredSupplyM).toBeCloseTo(4.2);
    for (const length of [1000, 2000, 800, 800])
      p = addGuidedTerminal(p, length);
    expect(p.airTerminals.map((t) => t.widthMm)).toEqual([
      1000, 2000, 800, 800,
    ]);
    expect(systemLinearBalances(p, p.hvacSystems[0].id)[0]).toMatchObject({
      installedM: 4.6,
      status: "ok",
    });
    expect(decodeProject(encodeProject(p)).airTerminals).toEqual(
      p.airTerminals,
    );
  });

  it("a 3.5 m shortage warns while preserving the chosen pieces through save/reopen", async () => {
    let p = guidedProjectFixture();
    for (const length of [1000, 1500, 1000]) p = addGuidedTerminal(p, length);
    const balance = systemLinearBalances(p, p.hvacSystems[0].id)[0];
    expect(balance.installedM).toBeCloseTo(3.5);
    expect(balance.marginM).toBeCloseTo(-0.7);
    expect(balance.status).toBe("deficit");
    expect(validateProject(p)).toContainEqual(
      expect.objectContaining({ code: "linearMeters", status: "warning" }),
    );
    const database = `guided-deficit-${crypto.randomUUID()}`;
    await new IndexedDbProjectRepository(database).save(p);
    const restored = await new IndexedDbProjectRepository(database).get(p.id);
    expect(restored?.airTerminals).toEqual(p.airTerminals);
    expect(systemLinearBalances(restored!, p.hvacSystems[0].id)[0].status).toBe(
      "deficit",
    );
  });

  it("one room keeps EDSC-C and EDFL independent and also accepts a wall grille", () => {
    let p = addGuidedTerminal(
      guidedProjectFixture(),
      1000,
      "EDSC-C",
      "ceiling",
    );
    p = addGuidedTerminal(p, 2000, "EDFL-20", "ceiling");
    p = addGuidedTerminal(p, 1000, "EBLF", "wall");
    const first = structuredClone(p.airTerminals[0]);
    const second = p.airTerminals[1];
    p = editOperatorTerminal(p, second.id, {
      widthMm: 1800,
      rotation: 0.3,
      finish: "Bianco scelto",
    });
    p = decodeProject(encodeProject(p));
    expect(p.airTerminals[0]).toEqual({
      ...first,
      requiredAirflowM3h: expect.any(Number),
    });
    expect(p.airTerminals[0]).toMatchObject({
      manualDimensions: true,
      widthMm: 500,
      heightMm: 500,
      depthMm: 200,
    });
    expect(validateProject(p)).toContainEqual(
      expect.objectContaining({
        code: "terminalManualDimensions",
        status: "warning",
        entityId: first.id,
      }),
    );
    expect(p.airTerminals[1]).toMatchObject({
      family: "EDFL-20",
      widthMm: 1800,
      rotation: 0.3,
      finish: "Bianco scelto",
    });
    expect(new Set(p.airTerminals.map((t) => t.roomId)).size).toBe(1);
    expect(p.airTerminals.map((t) => t.mounting)).toEqual([
      "ceiling",
      "ceiling",
      "wall",
    ]);
    expect(p.airTerminals[2].wallId).not.toBeNull();
    expect(p.airTerminals[1].wallId).toBeNull();
  });

  it("two machines have distinct saved plenums with identical domain, 3D and drawing port numbering", () => {
    let p = guidedProjectFixture();
    // Real machines provide independently documented inlet adapters.
    p = { ...p, hvacSystems: [], catalogVersions: {} };
    p = applyDuctedSystem(p, [p.rooms[0].id], "Mitsubishi Electric", null);
    p = addRectangle(p, p.floors[0].id, {
      width: 6,
      length: 5,
      height: 2.7,
      name: "Studio",
      origin: { x: 10, y: 0 },
    });
    p = applyDuctedSystem(
      p,
      [p.rooms.find((r) => r.name === "Studio")!.id],
      "Gree",
      null,
    );
    for (const i of [0, 1]) {
      const system = p.hvacSystems[i];
      const family = airTerminalCatalog.families.find(
        (f) => f.familyCode === "EDLS",
      )!;
      const solution = sizeAirTerminal(
        system.airflowM3h!,
        2,
        family,
        "supply",
      )[0];
      p = refreshDuctedBindings(
        applyAirTerminalSolution(
          p,
          system.roomIds[0],
          system.id,
          "supply",
          family.familyCode,
          solution,
          "ceiling",
        ),
      );
      p = placeSupplyPlenum(p, p.hvacSystems[i].id);
    }
    for (const terminal of p.airTerminals)
      p = addTerminalPlenum(p, terminal.id);
    expect(new Set(p.plenums.map((pl) => pl.id)).size).toBe(
      2 + p.airTerminals.length,
    );
    // Ogni bocchetta ha il proprio corpo, separato dal plenum macchina.
    expect(
      p.airTerminals.every((terminal) =>
        p.plenums.some(
          (pl) =>
            pl.id === terminal.plenumId && pl.attachmentId === terminal.id,
        ),
      ),
    ).toBe(true);
    for (const pl of p.plenums.filter((pl) => pl.attachmentId === undefined)) {
      const domain = calculateSupplyPlenum(p, pl.systemId!);
      const geometry = placedPlenumGeometry(p, pl)!;
      const layout = layoutFromMachineGeometry(geometry);
      const drawing = plenumTechnicalDrawing(p, pl.systemId!)!;
      expect(domain.branches.length).toBeGreaterThan(0);
      expect(layout.ports).toHaveLength(domain.branches.length);
      expect(drawing.portCount).toBe(domain.branches.length);
      expect(layout.ports.map((port) => port.number)).toEqual(
        Array.from({ length: domain.branches.length }, (_, n) => n + 1),
      );
      expect(
        drawing.labels
          .filter((label) => /^\d+$/.test(label.text))
          .map((label) => Number(label.text)),
      ).toEqual(layout.ports.map((port) => port.number));
      expect(
        layout.ports
          .flatMap((port) => port.branch.terminalIds)
          .every((id) => {
            const terminal = p.airTerminals.find((t) => t.id === id);
            return (
              !!terminal?.plenumId &&
              p.plenums.some(
                (item) =>
                  item.id === terminal.plenumId &&
                  item.attachmentId === terminal.id,
              )
            );
          }),
      ).toBe(true);
    }
  });

  it("ducts follow moved endpoints, preserve operator waypoints and do not duplicate on regeneration", () => {
    let p = guidedProjectFixture();
    for (const length of [2000, 2000, 2000]) p = addGuidedTerminal(p, length);
    for (const terminal of p.airTerminals)
      p = addTerminalPlenum(p, terminal.id);
    const systemId = p.hvacSystems[0].id;
    p = generateDuctRoutes(placeSupplyPlenum(p, systemId), systemId);
    const duct = p.ducts!.find((d) => d.terminalId)!;
    const waypoint = { x: 3, y: 3, elevationM: 2.3 };
    p = {
      ...p,
      ducts: p.ducts!.map((d) =>
        d.id === duct.id
          ? {
              ...d,
              routing: "manual",
              decisionOrigin: "manual",
              waypoints: [waypoint],
            }
          : d,
      ),
    };
    const originalStart = ductRoute(
      p,
      p.ducts!.find((d) => d.id === duct.id)!,
    )[0];
    const plenum = p.plenums.find((pl) => pl.attachmentId === undefined)!;
    p = moveSystemObject(p, plenum.id, {
      x: plenum.position.x + 0.5,
      y: plenum.position.y,
    });
    p = editOperatorTerminal(p, duct.terminalId!, { position: { x: 4, y: 4 } });
    p = generateDuctRoutes(p, systemId);
    const retained = p.ducts!.find((d) => d.id === duct.id)!;
    const route = ductRoute(p, retained);
    expect(route[0].x).toBeCloseTo(originalStart.x + 0.5);
    expect(route).toContainEqual(waypoint);
    // The hose ends at a plenum collar above the moved grille, not at its face centre.
    expect(route.at(-1)!.elevationM).toBeGreaterThan(
      p.airTerminals[0].elevationM!,
    );
    expect(Math.abs(route.at(-1)!.x - 4)).toBeLessThanOrEqual(
      p.airTerminals[0].widthMm / 2000,
    );
    expect(
      p.ducts!.filter(
        (d) => d.terminalId === duct.terminalId && d.branchId === duct.branchId,
      ),
    ).toHaveLength(1);
    expect(decodeProject(encodeProject(p)).ducts).toEqual(p.ducts);
  });

  it("a flexible duct starts from the plenum collar opening, not from an arbitrary machine face point", () => {
    let p = guidedProjectFixture();
    p = addGuidedTerminal(p, 2000);
    p = addTerminalPlenum(p, p.airTerminals[0].id);
    const systemId = p.hvacSystems[0].id;
    p = generateDuctRoutes(placeSupplyPlenum(p, systemId), systemId);
    const generated = p.ducts!.find((d) => d.terminalId)!;
    p = setDuctKind(p, generated.id, "flexible");
    const flexible = p.ducts!.find((d) => d.id === generated.id)!;
    // Il tubo parte dallo stacco del plenum macchina, non dalla faccia.
    const machineBody = p.plenums.find(
      (pl) => pl.attachmentId === undefined && pl.use === "supply",
    )!;
    const geometry = placedPlenumGeometry(p, machineBody)!;
    const index = Number(flexible.branchId?.split(":").at(-1) ?? 0);
    const port = geometry.ports.filter((item) =>
      item.branch.terminalIds.includes(p.airTerminals[0].id),
    )[index];
    const opening = plenumLocalToPlan(machineBody, [
      port.centerMm[0] / 1000,
      port.centerMm[1] / 1000,
      (port.centerMm[2] + port.collarLengthMm) / 1000,
    ]);
    const start = ductRoute(p, flexible)[0];
    expect(start.x).toBeCloseTo(opening.x);
    expect(start.y).toBeCloseTo(opening.y);
    expect(start.elevationM).toBeCloseTo(opening.elevationM);
  });

  it("adds and removes flexible bending points on the saved route", () => {
    let p = guidedProjectFixture();
    p = addGuidedTerminal(p, 2000);
    p = addTerminalPlenum(p, p.airTerminals[0].id);
    const systemId = p.hvacSystems[0].id;
    p = generateDuctRoutes(placeSupplyPlenum(p, systemId), systemId);
    const generated = p.ducts!.find((d) => d.terminalId)!;
    p = setDuctKind(p, generated.id, "flexible");
    const added = addDuctWaypoint(p, generated.id);
    expect(added.index).toBeGreaterThanOrEqual(0);
    p = added.project;
    const duct = p.ducts!.find((d) => d.id === generated.id)!;
    expect(duct.routing).toBe("manual");
    const insertionCount = duct.waypoints.length;
    expect(insertionCount).toBeGreaterThan(0);
    const route = ductRoute(p, duct);
    expect(route).toContainEqual(duct.waypoints[added.index]);
    const requested = addDuctWaypoint(p, generated.id, {
      x: duct.waypoints[0].x + 0.1,
      y: duct.waypoints[0].y + 0.1,
      elevationM: duct.waypoints[0].elevationM,
    });
    p = requested.project;
    const flexible = p.ducts!.find((d) => d.id === generated.id)!;
    expect(flexible.waypoints).toHaveLength(insertionCount + 1);
    p = removeDuctWaypoint(p, generated.id, 0);
    expect(p.ducts!.find((d) => d.id === generated.id)!.waypoints).toHaveLength(
      insertionCount,
    );
    expect(() =>
      addDuctWaypoint(
        {
          ...p,
          ducts: p.ducts!.map((d) =>
            d.id === generated.id ? { ...d, locked: true } : d,
          ),
        },
        generated.id,
      ),
    ).toThrow(/Sblocca il canale/);
  });

  it("a rotated pillar reduces usable area and thermal load once through command, undo and reload", () => {
    const initial = guidedProjectFixture();
    const store = useProjectStore;
    store.getState().load(initial);
    store.getState().commit((p) =>
      addPillar(p, p.floors[0].id, {
        position: { x: 2, y: 2 },
        widthMm: 600,
        depthMm: 800,
        heightMm: 2700,
        rotation: 0.4,
      }),
    );
    const p = store.getState().project!;
    expect(store.getState().error).toBeNull();
    expect(p.rooms[0].netAreaM2).toBeCloseTo(initial.rooms[0].netAreaM2 - 0.48);
    expect(initial.rooms[0].designLoadW - p.rooms[0].designLoadW).toBeCloseTo(
      0.48 * 2.7 * 35,
    );
    expect(pillarFootprint(p.pillars![0])).toHaveLength(4);
    expect(
      recomputeProject(recomputeProject(p)).rooms[0].netAreaM2,
    ).toBeCloseTo(p.rooms[0].netAreaM2);
    store.getState().undo();
    expect(store.getState().project?.pillars).toHaveLength(0);
    store.getState().redo();
    expect(
      decodeProject(encodeProject(store.getState().project!)).pillars,
    ).toEqual(p.pillars);
  });

  it("locked terminal geometry rejects commits without corrupting history; unlock/edit supports undo and redo", () => {
    const store = useProjectStore;
    store.getState().load(addGuidedTerminal(guidedProjectFixture(), 1000));
    const id = store.getState().project!.airTerminals[0].id;
    store.getState().commit((p) => ({
      ...p,
      airTerminals: p.airTerminals.map((t) => ({ ...t, locked: true })),
    }));
    const history = store.getState().past.length;
    store.getState().commit((p) => ({
      ...p,
      airTerminals: p.airTerminals.map((t) => ({ ...t, widthMm: 2000 })),
    }));
    expect(store.getState().error).toMatch(/bloccato/);
    expect(store.getState().past).toHaveLength(history);
    expect(store.getState().project?.airTerminals[0].widthMm).toBe(1000);
    store.getState().commit((p) => ({
      ...p,
      airTerminals: p.airTerminals.map((t) => ({ ...t, locked: false })),
    }));
    store
      .getState()
      .commit((p) => editOperatorTerminal(p, id, { widthMm: 2000 }));
    expect(store.getState().project?.airTerminals[0].widthMm).toBe(2000);
    store.getState().undo();
    expect(store.getState().project?.airTerminals[0].widthMm).toBe(1000);
    store.getState().redo();
    expect(store.getState().project?.airTerminals[0].widthMm).toBe(2000);
  });

  it("v2 migration preserves existing objects and default internal dimensions; eleven-step state reopens", async () => {
    const initial = addGuidedTerminal(guidedProjectFixture(), 1000);
    const old = JSON.parse(JSON.stringify(initial));
    old.schemaVersion = 2;
    delete old.pillars;
    delete old.ducts;
    delete old.plenums;
    delete old.projectSettings.dimensionMode;
    delete old.floors[0].configurationWizard;
    for (const t of old.airTerminals) {
      delete t.locked;
      delete t.plenumId;
    }
    const migrated = parseProject(old);
    expect(migrated.walls).toEqual(initial.walls);
    expect(migrated.airTerminals).toEqual(initial.airTerminals);
    expect(migrated.projectSettings.dimensionMode).toBe("internal");
    const p = {
      ...migrated,
      floors: migrated.floors.map((f) => ({
        ...f,
        configurationWizard: {
          step: 10,
          status: "complete" as const,
          confirmedSteps: Array.from({ length: 11 }, (_, i) => i),
        },
      })),
    };
    const database = `guided-migration-${crypto.randomUUID()}`;
    await new IndexedDbProjectRepository(database).save(p);
    const reopened = await new IndexedDbProjectRepository(database).get(p.id);
    expect(reopened?.floors[0].configurationWizard).toEqual(
      p.floors[0].configurationWizard,
    );
  });
});
