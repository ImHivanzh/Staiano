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

it("carica il nuovo EXE come allegato Codeberg e registra il suo hash", async () => {
  const bytes = Buffer.from("codeberg-exe"),
    commit = "e".repeat(40);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  read.mockImplementation(async (file: string) =>
    file.endsWith(".json")
      ? JSON.stringify({ dirty: false, commit, size: bytes.length, sha256 })
      : bytes,
  );
  vi.stubEnv("CODEBERG_TOKEN", "repo-token-di-prova");
  vi.stubEnv("LICENSE_PUBLISH_TOKEN", "publisher-di-prova");
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith(`/releases/tags/exe-${commit}`)) return json({}, 404);
    if (
      url === "https://codeberg.org/api/v1/repos/AvocadoOra/Staiano-3D/releases"
    )
      return json({ id: 8 }, 201);
    if (url.endsWith("/releases/8/assets")) return json([]);
    if (url.endsWith("/releases/8/assets?name=StaianoHVAC.exe"))
      return json({ state: "uploaded" }, 201);
    if (url === "https://licenses.ivanbuonocore.dev/publish")
      return json({ status: "published" });
    throw new Error(`Richiesta inattesa: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  // @ts-expect-error JavaScript CLI entry point, isolated filesystem and network.
  await import("../../scripts/publish-executable.mjs");
  const upload = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith("/releases/8/assets?name=StaianoHVAC.exe"),
  );
  expect(upload?.[1]).toMatchObject({
    method: "POST",
    body: expect.any(FormData),
    headers: { Authorization: "token repo-token-di-prova" },
    redirect: "error",
  });
  const attachment = (upload?.[1].body as FormData).get("attachment") as File;
  expect(attachment.name).toBe("StaianoHVAC.exe");
  expect(Buffer.from(await attachment.arrayBuffer())).toEqual(bytes);
  const registration = fetchMock.mock.calls.find(
    ([url]) => url === "https://licenses.ivanbuonocore.dev/publish",
  );
  expect(JSON.parse(registration?.[1].body)).toMatchObject({
    commit,
    sha256,
    url: `https://codeberg.org/AvocadoOra/Staiano-3D/releases/download/exe-${commit}/StaianoHVAC.exe`,
  });
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
          browser_download_url: `https://codeberg.org/AvocadoOra/Staiano-3D/releases/download/exe-${commit}/StaianoHVAC.exe`,
        },
      ]);
    if (
      url ===
      `https://codeberg.org/AvocadoOra/Staiano-3D/releases/download/exe-${commit}/StaianoHVAC.exe`
    )
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
