import { expect, it, vi } from "vitest";
// @ts-expect-error JavaScript release helper.
import { pruneExecutablePackages } from "../../scripts/prune-executable-packages.mjs";

const pkg = (id: number) => ({
  id,
  name: "staiano-hvac",
  package_type: "generic",
  status: "default",
  version: String(id).repeat(40),
});

it("retains current and rollback EXEs across pages and leaves unrelated packages intact", async () => {
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return url.endsWith("page=1")
      ? Response.json([pkg(4), { ...pkg(9), name: "other" }, pkg(3)], {
          headers: { "x-next-page": "2" },
        })
      : Response.json([pkg(2), pkg(1), { ...pkg(8), status: "processing" }]);
  });
  expect(await pruneExecutablePackages(request, pkg(4).version)).toBe(2);
  expect(
    request.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => url),
  ).toEqual(["/packages/2", "/packages/1"]);
});

it("never prunes when retrying a publication older than the newest package", async () => {
  const request = vi.fn(async () => Response.json([pkg(4), pkg(3), pkg(2)]));
  expect(await pruneExecutablePackages(request, pkg(2).version)).toBe(0);
  expect(request).toHaveBeenCalledTimes(1);
});

it("stops on an incomplete listing without deleting anything", async () => {
  const request = vi.fn(async () => new Response(null, { status: 503 }));
  await expect(
    pruneExecutablePackages(request, pkg(4).version),
  ).rejects.toThrow("503");
  expect(request).toHaveBeenCalledTimes(1);
});
