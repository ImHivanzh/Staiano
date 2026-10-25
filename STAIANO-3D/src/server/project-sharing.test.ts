import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProject } from "@/domain/project";
import {
  accessible,
  acquireLease,
  requireLease,
  readSharedProjects,
  sharedTransaction,
  type SharedRecord,
} from "./project-sharing";
function record(): SharedRecord {
  return {
    project: createProject("Condiviso"),
    owner: "admin",
    members: ["mario"],
    revision: 1,
    previous: null,
    lease: null,
    audit: [],
  };
}
it("isolates projects, excludes a second tab even for the same user, and rejects stale revisions", () => {
  const item = record();
  expect(accessible(item, "stranger")).toBe(false);
  expect(() => acquireLease(item, "stranger", "a", 1)).toThrow(
    "non disponibile",
  );
  acquireLease(item, "admin", "a", 1);
  expect(() => acquireLease(item, "admin", "b", 2)).toThrow("in modifica");
  expect(() => acquireLease(item, "mario", "b", 2)).toThrow("in modifica");
  expect(() => requireLease(item, "admin", "a", 0, 2)).toThrow(
    "Versione cambiata",
  );
  expect(() => requireLease(item, "admin", "a", 1, 90_002)).toThrow("scaduto");
  acquireLease(item, "mario", "b", 90_002);
  requireLease(item, "mario", "b", 1, 90_003);
  expect(() => requireLease(item, "admin", "a", 1, 90_003)).toThrow("scaduto");
});
it("reads the last committed snapshot during a write without locking or rewriting it", async () => {
  const folder = await mkdtemp(join(tmpdir(), "staiano-read-sharing-"));
  const file = join(folder, "projects.json");
  let release!: () => void;
  let entered!: () => void;
  const writing = new Promise<void>((done) => {
    entered = done;
  });
  const blocked = new Promise<void>((done) => {
    release = done;
  });
  let writer: Promise<void> | undefined;
  try {
    expect(Object.keys(await readSharedProjects(file))).toEqual([]);
    await sharedTransaction((items) => {
      items.test = record();
    }, file);
    const before = await stat(file);
    writer = sharedTransaction(async (items) => {
      items.test.revision++;
      entered();
      await blocked;
    }, file);
    await writing;
    expect((await readSharedProjects(file)).test.revision).toBe(1);
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    release();
    await writer;
    expect((await readSharedProjects(file)).test.revision).toBe(2);
    await writeFile(file, "invalid JSON");
    await expect(readSharedProjects(file)).rejects.toThrow();
  } finally {
    release();
    await writer;
    await rm(folder, { recursive: true, force: true });
  }
});
it("serializes concurrent transactions and rolls back failed mutations durably", async () => {
  const folder = await mkdtemp(join(tmpdir(), "staiano-sharing-"));
  const file = join(folder, "projects.json");
  try {
    await sharedTransaction((items) => {
      items.test = record();
    }, file);
    await Promise.all(
      Array.from({ length: 6 }, () =>
        sharedTransaction((items) => {
          items.test.revision++;
        }, file),
      ),
    );
    expect(JSON.parse(await readFile(file, "utf8")).test.revision).toBe(7);
    await expect(
      sharedTransaction((items) => {
        items.test.revision = 99;
        throw new Error("abort");
      }, file),
    ).rejects.toThrow("abort");
    expect(JSON.parse(await readFile(file, "utf8")).test.revision).toBe(7);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
