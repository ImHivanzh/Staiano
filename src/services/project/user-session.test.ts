import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { createProject } from "@/domain/project";
import * as session from "./session";

it("keeps named-user local archives separate and preserves the original admin repository", async () => {
  const admin = createProject("Progetto admin precedente");
  session.configureProjectSession("admin");
  await session.repository.save(admin);
  await session.repository.setActiveId(admin.id);
  session.configureProjectSession("samuele");
  expect(await session.repository.get(admin.id)).toBeNull();
  const samuele = createProject("Progetto Samuele");
  await session.repository.save(samuele);
  session.configureProjectSession("gionathan");
  expect(await session.repository.get(samuele.id)).toBeNull();
  session.configureProjectSession("samuele");
  expect((await session.repository.get(samuele.id))?.name).toBe(samuele.name);
  session.configureProjectSession("admin");
  expect(await session.repository.lastActiveId()).toBe(admin.id);
  expect((await session.repository.get(admin.id))?.name).toBe(admin.name);
});
