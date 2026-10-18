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

it("un tentativo ripetuto registra l'hash del pacchetto immutabile già caricato", async () => {
  const local = Buffer.from("new-exe"),
    published = Buffer.from("old-exe"),
    commit = "c".repeat(40);
  read.mockImplementation(async (file: string) =>
    file.endsWith(".json")
      ? JSON.stringify({
          dirty: false,
          commit,
          size: local.length,
          sha256: createHash("sha256").update(local).digest("hex"),
        })
      : local,
  );
  vi.stubEnv("CODEBERG_TOKEN", "repo-token-di-prova");
  vi.stubEnv("LICENSE_PUBLISH_TOKEN", "publisher-di-prova");
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    });
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith(`/releases/tags/exe-${commit}`)) return json({ id: 7 });
    if (url.endsWith("/releases/7/assets"))
      return json([
        {
          name: "StaianoHVAC.exe",
          size: published.length,
          browser_download_url: "https://codeberg.org/attachments/exe",
        },
      ]);
    if (url === "https://codeberg.org/attachments/exe")
      return new Response(published);
    if (url === "https://licenses.ivanbuonocore.dev/publish")
      return json({ status: "published" });
    throw new Error(`Richiesta inattesa: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  // @ts-expect-error JavaScript CLI entry point; executed against isolated filesystem and network mocks.
  await import("../../scripts/publish-executable.mjs");
  const call = fetchMock.mock.calls.find(
    ([url]) => url === "https://licenses.ivanbuonocore.dev/publish",
  );
  expect(JSON.parse(call?.[1].body)).toMatchObject({
    sha256: createHash("sha256").update(published).digest("hex"),
    size: published.length,
  });
});
