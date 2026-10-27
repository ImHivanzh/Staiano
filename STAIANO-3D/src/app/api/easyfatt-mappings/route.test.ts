import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  user: true,
  records: {} as Record<string, unknown>,
}));
vi.mock("@/server/auth", () => ({
  SESSION_COOKIE: "session",
  getAccessConfig: async () => ({}),
  getSessionUser: () =>
    state.user ? { username: "operator", mustChangePassword: false } : null,
  isSameOrigin: (request: NextRequest) =>
    request.headers.get("origin") === "http://localhost",
}));
vi.mock("@/server/project-sharing", () => ({
  readSharedProjects: async () => state.records,
  sharedTransaction: async (
    operation: (records: Record<string, unknown>) => void,
  ) => operation(state.records),
}));
import { GET, POST } from "./route";
const request = (body: unknown, origin = "http://localhost") =>
  new NextRequest("http://localhost/api/easyfatt-mappings", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  state.records = {};
  state.user = true;
});
it("shares saved mappings and rejects invalid or cross-origin updates", async () => {
  const body = {
    key: "fan-coil:aermec-fcz200po",
    mapping: { code: "0012", multiplier: 3, quantity: "pieces" },
  };
  expect((await POST(request(body))).status).toBe(200);
  const result = await GET(
    new NextRequest("http://localhost/api/easyfatt-mappings"),
  );
  expect((await result.json()).mappings[body.key]).toEqual(body.mapping);
  expect(
    (
      await POST(
        request({ ...body, mapping: { ...body.mapping, multiplier: 0 } }),
      )
    ).status,
  ).toBe(400);
  expect((await POST(request(body, "https://example.com"))).status).toBe(403);
  expect(state.records[body.key]).toEqual(body.mapping);
  expect((await POST(request({ key: "rad:test", mapping: { code: "", supplierCode: "SUP-1", supplier: "Radiatori", multiplier: 2, quantity: "material" } }))).status).toBe(200);
  state.user = false;
  expect(
    (await GET(new NextRequest("http://localhost/api/easyfatt-mappings")))
      .status,
  ).toBe(401);
});
