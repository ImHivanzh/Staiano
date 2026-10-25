import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: read }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each([false, true])(
  "pubblica EXE GitLab immutabile e registra l'hash effettivo (retry: %s)",
  async (retry) => {
    const local = Buffer.from("new-exe"),
      existing = Buffer.from("old-exe"),
      commit = "e".repeat(40);
    const bytes = retry ? existing : local;
    const hash = (data: Buffer) =>
      createHash("sha256").update(data).digest("hex");
    read.mockImplementation(async (file: string) =>
      file.endsWith(".json")
        ? JSON.stringify({
            dirty: false,
            commit,
            size: local.length,
            sha256: hash(local),
          })
        : local,
    );
    vi.stubEnv("GITLAB_TOKEN", "repo-token-di-prova");
    vi.stubEnv("LICENSE_PUBLISH_TOKEN", "publisher-di-prova");
    const base = "https://gitlab.com/api/v4/projects/87880568";
    const url = `${base}/packages/generic/staiano-hvac/${commit}/StaianoHVAC.exe`;
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: string, init: RequestInit = {}) => {
        if (input === url && init.method === "PUT") return json({}, 201);
        if (input === url)
          return retry ? new Response(existing) : json({}, 404);
        if (input === `${base}/releases/exe-${commit}`) return json({}, 404);
        if (input === `${base}/releases`)
          return json({ tag_name: `exe-${commit}` }, 201);
        if (input === "https://licenses.ivanbuonocore.dev/publish")
          return json({ status: "published" });
        if (input.startsWith(`${base}/packages?`)) return json([]);
        throw new Error(`Richiesta inattesa: ${input}`);
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    // @ts-expect-error JavaScript CLI entry point with isolated filesystem and network.
    await import("../../scripts/publish-executable.mjs");
    const uploads = fetchMock.mock.calls.filter(
      ([, init]) => init.method === "PUT",
    );
    expect(uploads).toHaveLength(retry ? 0 : 1);
    if (!retry)
      expect(uploads[0][1]).toMatchObject({
        body: local,
        headers: { "PRIVATE-TOKEN": "repo-token-di-prova" },
        redirect: "error",
      });
    const release = fetchMock.mock.calls.find(
      ([input]) => input === `${base}/releases`,
    )!;
    expect(JSON.parse(release[1].body)).toMatchObject({
      ref: commit,
      assets: { links: [{ url, direct_asset_path: "/StaianoHVAC.exe" }] },
    });
    const registration = fetchMock.mock.calls.find(
      ([input]) => input === "https://licenses.ivanbuonocore.dev/publish",
    )!;
    expect(JSON.parse(registration[1].body)).toEqual({
      commit,
      sha256: hash(bytes),
      size: bytes.length,
      url,
    });
  },
);
