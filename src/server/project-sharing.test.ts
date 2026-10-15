import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createProject } from "@/domain/project";
import {
  accessible,
  acquireLease,
  requireLease,
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
