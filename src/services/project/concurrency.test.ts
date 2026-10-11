import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createProject, duplicateProject } from "@/domain/project";
import { IndexedDbProjectRepository, ProjectConflictError } from "./repository";
import * as session from "./session";
import { useProjectStore } from "@/stores/project-store";

describe("concurrent project saves", () => {
  it("rejects stale edits even when both writes have the same timestamp; copying preserves both versions", async () => {
    const name = `concurrent-${crypto.randomUUID()}`;
    const first = new IndexedDbProjectRepository(name);
    const second = new IndexedDbProjectRepository(name);
    const project = createProject("Originale");
    await first.save(project);
    const stale = (await second.get(project.id))!;
    project.name = "Modifica scheda A";
    await first.save(project);
    stale.projectSettings.defaultHeightM = 3;
    await expect(second.save(stale)).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
    await expect(second.save(stale)).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
    const copy = duplicateProject(stale, "Copia scheda B");
    await second.save(copy);
    expect((await first.get(project.id))?.name).toBe("Modifica scheda A");
    expect((await second.get(copy.id))?.projectSettings.defaultHeightM).toBe(3);
    const latest = (await second.get(project.id))!;
    latest.name = "Dopo ricaricamento";
    await second.save(latest);
    expect((await first.get(project.id))?.name).toBe("Dopo ricaricamento");
  });

  it("does not recreate a project deleted by another tab, even after checking the archive", async () => {
    const name = `deleted-${crypto.randomUUID()}`;
    const first = new IndexedDbProjectRepository(name);
    const second = new IndexedDbProjectRepository(name);
    const project = createProject();
    await first.save(project);
    const stale = (await second.get(project.id))!;
    await first.delete(project.id);
    expect(await second.get(project.id)).toBeNull();
    await expect(second.save(stale)).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
    expect(await first.list()).toEqual([]);
  });

  it("allows only one writer to create the same identifier and keeps the previous snapshot", async () => {
    const name = `atomic-${crypto.randomUUID()}`;
    const first = new IndexedDbProjectRepository(name);
    const second = new IndexedDbProjectRepository(name);
    const project = createProject("Prima");
    const results = await Promise.allSettled([
      first.save(project),
      second.save(project),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const latest = (await first.get(project.id))!;
    latest.name = "Seconda";
    latest.updatedAt = new Date(Date.parse(latest.updatedAt) + 1).toISOString();
    await first.save(latest);
    expect((await first.previous(project.id))?.name).toBe("Prima");
  });

  it("surfaces conflicts without marking the local draft as saved, and drains queued autosaves before switching to a copy", async () => {
    const username = `conflict-${crypto.randomUUID()}`;
    session.configureProjectSession(username);
    const project = createProject("Iniziale");
    await session.repository.save(project);
    useProjectStore.getState().load(project);
    const other = new IndexedDbProjectRepository(
      `staiano-hvac-v1-user-${username}`,
    );
    const changed = (await other.get(project.id))!;
    changed.name = "Altra scheda";
    await other.save(changed);
    useProjectStore
      .getState()
      .commit((local) => ({ ...local, name: "Bozza locale" }));
    const results = await Promise.allSettled([
      session.saveCurrent(),
      session.saveCurrent(),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(useProjectStore.getState()).toMatchObject({
      dirty: true,
      saveStatus: "error",
      saveConflict: true,
    });
    expect(useProjectStore.getState().project?.name).toBe("Bozza locale");
    await expect(session.flushSave()).rejects.toBeInstanceOf(
      ProjectConflictError,
    );
    await session.settlePendingSaves();
    const copy = duplicateProject(
      useProjectStore.getState().project!,
      "Copia locale",
    );
    await session.repository.save(copy);
    useProjectStore.getState().load(copy);
    await expect(session.flushSave()).resolves.toBeUndefined();
    const sameCopy = (await other.get(copy.id))!;
    await session.saveCurrent();
    await expect(other.save(sameCopy)).resolves.toBeUndefined();
  });
});
