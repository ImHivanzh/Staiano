import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  addRectangle,
  createProject,
  duplicateProject,
} from "@/domain/project";
import { decodeProject, encodeProject, parseProject } from "./format";
import { IndexedDbProjectRepository } from "./repository";
import { useProjectStore } from "@/stores/project-store";
import { CURRENT_SCHEMA_VERSION } from "@/schemas/project";
const fixture = () => {
  const p = createProject("Casa Rossi");
  return addRectangle(p, p.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Soggiorno",
  });
};
describe("formato e archivio", () => {
  it("roundtrip ricalcola valori derivati", () => {
    const p = fixture();
    p.rooms[0].designLoadW = 1;
    const next = decodeProject(encodeProject(p));
    expect(next.rooms[0].designLoadW).toBeCloseTo(1890);
    expect(next.id).toBe(p.id);
  });
  it("rifiuta JSON, versioni future e riferimenti mancanti", () => {
    expect(() => decodeProject("<html>")).toThrow();
    expect(() => parseProject({ schemaVersion: 9 })).toThrow(/Versione/);
    const p = fixture();
    p.walls[0].floorId = "missing";
    expect(() => parseProject(p)).toThrow(/Piano/);
  });
  it("rifiuta negativi, duplicati, coefficiente alterato", () => {
    const p = fixture();
    expect(() =>
      parseProject({
        ...p,
        projectSettings: { ...p.projectSettings, coefficientWm3: 40 },
      }),
    ).toThrow();
    expect(() =>
      parseProject({ ...p, walls: [...p.walls, p.walls[0]] }),
    ).toThrow(/duplicati/);
    expect(() =>
      parseProject({
        ...p,
        walls: p.walls.map((w) => ({ ...w, thickness: -1 })),
      }),
    ).toThrow();
  });
  it("migra v0 senza cambiare geometria", () => {
    const p = fixture();
    const old = {
      ...p,
      schemaVersion: 0,
      rooms: p.rooms.map((r) => {
        const raw: Record<string, unknown> = { ...r };
        delete raw.supplyPoints;
        delete raw.returnPoints;
        return raw;
      }),
    };
    const next = parseProject(old);
    expect(next.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(next.rooms[0].supplyPoints).toBe(1);
  });
  it("migra v2 in modo additivo senza alterare i dati esistenti", () => {
    const p = fixture();
    const v2 = JSON.parse(JSON.stringify({ ...p, schemaVersion: 2 }));
    for (const w of v2.walls) delete w.locked;
    for (const r of v2.rooms) delete r.usage;
    delete v2.plenums;
    delete v2.floors[0].importAnalysis;
    delete v2.projectSettings.dimensionMode;
    const next = parseProject(v2);
    expect(next.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(next.projectSettings.dimensionMode).toBe("internal");
    expect(next.plenums).toEqual([]);
    expect(next.walls[0].locked).toBe(false);
    expect(next.rooms[0].usage).toBe("");
    // Preservation proof: removing v3-only keys restores the v2 payload.
    const rolledBack = JSON.parse(JSON.stringify(next));
    expect(rolledBack.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    for (const w of rolledBack.walls) delete w.locked;
    for (const r of rolledBack.rooms) delete r.usage;
    delete rolledBack.plenums;
    delete rolledBack.floors[0].importAnalysis;
    delete rolledBack.projectSettings.dimensionMode;
    rolledBack.schemaVersion = 2;
    expect(rolledBack.walls).toEqual(v2.walls);
    expect(rolledBack.rooms).toEqual(v2.rooms);
    expect(rolledBack.projectSettings).toEqual(v2.projectSettings);
  });
  it("salva, ricarica, recupera precedente, duplica ed elimina", async () => {
    const repo = new IndexedDbProjectRepository(`test-${crypto.randomUUID()}`),
      p = fixture();
    await repo.save(p);
    await repo.setActiveId(p.id);
    expect(await repo.lastActiveId()).toBe(p.id);
    const changed = {
      ...p,
      name: "Modificato",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    };
    await repo.save(changed);
    expect((await repo.get(p.id))?.name).toBe("Modificato");
    expect((await repo.previous(p.id))?.name).toBe("Casa Rossi");
    const copy = duplicateProject(changed);
    await repo.save(copy);
    expect(await repo.list()).toHaveLength(2);
    await repo.delete(p.id);
    expect(await repo.get(p.id)).toBeNull();
    expect(await repo.previous(p.id)).toBeNull();
    expect(await repo.lastActiveId()).toBeNull();
  });
  it("undo e redo recuperano geometria e formule", () => {
    const store = useProjectStore;
    const p = createProject();
    store.getState().load(p);
    store.getState().commit((p) =>
      addRectangle(p, p.floors[0].id, {
        width: 5,
        length: 4,
        height: 2.7,
        name: "Camera",
      }),
    );
    expect(store.getState().project?.rooms).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().project?.walls).toHaveLength(0);
    store.getState().redo();
    expect(store.getState().project?.rooms[0].designLoadW).toBeCloseTo(1890);
  });
});
