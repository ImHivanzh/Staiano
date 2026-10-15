import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createProject } from "@/domain/project";
const state = vi.hoisted(() => ({
  username: "admin" as string | null,
  file: "",
}));
vi.mock("@/server/auth", () => ({
  SESSION_COOKIE: "staiano_session",
  getAccessConfig: async () => ({}),
  getSessionUser: () =>
    state.username
      ? { username: state.username, mustChangePassword: false }
      : null,
  isSameOrigin: (request: Request) =>
    request.headers.get("origin") === "http://localhost:3015",
  managedUsers: () => [
    { username: "admin", disabled: false },
    { username: "mario", disabled: false },
  ],
}));
vi.mock("@/server/project-sharing", async (original) => {
  const routeModule =
    await original<typeof import("@/server/project-sharing")>();
  return {
    ...routeModule,
    sharedTransaction: (
      operation: Parameters<typeof routeModule.sharedTransaction>[0],
    ) => routeModule.sharedTransaction(operation, state.file),
  };
});
import { GET, POST } from "./route";
const token = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "staiano-route-"));
  state.file = join(folder, "projects.json");
  state.username = "admin";
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});
function post(body: object, origin = "http://localhost:3015") {
  return POST(
    new NextRequest("http://localhost:3015/api/projects", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...body }),
    }),
  );
}
it("requires authentication and same-origin mutations", async () => {
  state.username = null;
  expect(
    (await GET(new NextRequest("http://localhost:3015/api/projects"))).status,
  ).toBe(401);
  state.username = "admin";
  expect(
    (await post({ action: "publish", id: "x" }, "https://attacker.example"))
      .status,
  ).toBe(403);
});
it("only owner can grant, recipients see project, revoked users lose access, and audit describes saved changes", async () => {
  const project = createProject("Original");
  expect(
    (await post({ action: "publish", id: project.id, project })).status,
  ).toBe(200);
  state.username = "mario";
  expect(
    (
      await GET(
        new NextRequest(`http://localhost:3015/api/projects?id=${project.id}`),
      )
    ).status,
  ).toBe(404);
  state.username = "admin";
  expect(
    (
      await post({
        action: "share",
        id: project.id,
        username: "mario",
        revision: 1,
      })
    ).status,
  ).toBe(200);
  state.username = "mario";
  expect(
    (
      await GET(
        new NextRequest(`http://localhost:3015/api/projects?id=${project.id}`),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post({
        action: "revoke",
        id: project.id,
        username: "admin",
        revision: 1,
      })
    ).status,
  ).toBe(403);
  state.username = "admin";
  const saved = await post({
    action: "save",
    id: project.id,
    revision: 1,
    project: { ...project, name: "New name" },
  });
  expect(saved.status).toBe(200);
  expect((await saved.json()).audit.at(-1).action).toContain(
    "Original → New name",
  );
  expect(
    (await post({ action: "save", id: project.id, revision: 1, project }))
      .status,
  ).toBe(409);
  expect(
    (
      await post({
        action: "revoke",
        id: project.id,
        username: "mario",
        revision: 2,
      })
    ).status,
  ).toBe(200);
  state.username = "mario";
  expect(
    (
      await GET(
        new NextRequest(`http://localhost:3015/api/projects?id=${project.id}`),
      )
    ).status,
  ).toBe(404);
});
