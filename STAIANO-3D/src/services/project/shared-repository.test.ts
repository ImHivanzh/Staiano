import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createProject } from "@/domain/project";
import { SharedProjectRepository } from "./shared-repository";
import {
  acquireLease,
  requireLease,
  type SharedRecord,
} from "@/server/project-sharing";

afterEach(() => vi.unstubAllGlobals());
it("distinguishes an unavailable shared list from an empty one and keeps local projects usable", async () => {
  const { project } = server();
  const repository = new SharedProjectRepository(
    `sharing-list-${crypto.randomUUID()}`,
  );
  const local = createProject("Local");
  await repository.save(local);
  await repository.get(project.id);
  expect((await repository.list()).map((item) => item.id)).toContain(
    project.id,
  );
  expect(repository.listError).toBeNull();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect((await repository.list()).map((item) => item.id)).toEqual([local.id]);
  expect(repository.listError).toContain("Archivio condiviso non disponibile");
  expect((await repository.get(local.id))?.id).toBe(local.id);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ projects: [], users: [] })),
  );
  expect((await repository.list()).map((item) => item.id)).toEqual([local.id]);
  expect(repository.listError).toBeNull();
});
function server() {
  const project = createProject("Shared");
  const item: SharedRecord = {
    project,
    owner: "admin",
    members: ["mario"],
    revision: 1,
    previous: null,
    lease: null,
    audit: [],
  };
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    try {
      if (!body && !url.includes("?id="))
        return Response.json({ projects: [item.project], users: [] });
      if (!body) return Response.json(item);
      if (body.action === "acquire") acquireLease(item, "admin", body.token);
      if (body.action === "save") {
        requireLease(item, "admin", body.token, body.revision);
        item.project = body.project;
        item.revision++;
      }
      if (body.action === "release" && item.lease?.token === body.token)
        item.lease = null;
      return Response.json(item);
    } catch (failure) {
      return Response.json(
        { message: (failure as Error).message },
        { status: 423 },
      );
    }
  });
  vi.stubGlobal("fetch", fetch);
  return { project, item, fetch };
}
it("second tab is read only, cannot save, and can acquire after release", async () => {
  const { project, item } = server();
  const first = new SharedProjectRepository(
    `sharing-first-${crypto.randomUUID()}`,
  );
  const second = new SharedProjectRepository(
    `sharing-second-${crypto.randomUUID()}`,
  );
  await first.get(project.id);
  await second.get(project.id);
  expect(second.isReadOnly(project.id)).toBe(true);
  await expect(second.save({ ...project, name: "Illegal" })).rejects.toThrow();
  await first.save({ ...project, name: "Updated" });
  expect(item.revision).toBe(2);
  await first.action(project.id, "release");
  expect((await second.get(project.id))?.name).toBe("Updated");
  expect(second.isReadOnly(project.id)).toBe(false);
  await second.save({ ...item.project, name: "Second" });
  expect(item.revision).toBe(3);
});
it("shared projects fail closed offline without falling back to a local save", async () => {
  const { project } = server();
  const repository = new SharedProjectRepository(
    `sharing-offline-${crypto.randomUUID()}`,
  );
  await repository.get(project.id);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(repository.get(project.id)).rejects.toThrow("offline");
  await expect(repository.save(project)).rejects.toThrow("offline");
  expect(repository.isReadOnly(project.id)).toBe(true);
});
it("refreshing the audit never advances the expected revision of unsaved local edits", async () => {
  const { project, item } = server();
  const repository = new SharedProjectRepository(
    `sharing-revision-${crypto.randomUUID()}`,
  );
  await repository.get(project.id);
  item.revision = 2;
  await repository.refresh(project.id);
  expect(repository.details(project.id)?.revision).toBe(1);
  await expect(repository.save(project)).rejects.toThrow("Versione cambiata");
});
