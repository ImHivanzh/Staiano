import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { historyAssets } from "./history-index";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
const [version, asset] = Object.entries(historyAssets.hvac)[0];
const bytes = () => readFile(`public/catalog-history/${asset.file}`);

it("fetches only the requested historical revision once and verifies its digest before exposing it", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(new Uint8Array(await bytes())),
  );
  vi.stubGlobal("fetch", fetch);
  const history = await import("./history-browser");
  expect(fetch).not.toHaveBeenCalled();
  expect(() => history.readArchivedCatalog("hvac", version)).toThrow(
    "Caricare",
  );
  const [first, second] = await Promise.all([
    history.loadArchivedCatalog("hvac", version),
    history.loadArchivedCatalog("hvac", version),
  ]);
  expect(first).toBe(second);
  expect(first).toMatchObject({ version });
  expect(history.readArchivedCatalog("hvac", version)).toBe(first);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(`/catalog-history/${asset.file}`);
});

it("does not cache a failure, rejects tampered bytes and never substitutes a missing revision", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("offline", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const history = await import("./history-browser");
  await expect(history.loadArchivedCatalog("hvac", version)).rejects.toThrow(
    "non disponibile",
  );
  fetch.mockResolvedValueOnce(Response.json({ version: "substituted" }));
  await expect(history.loadArchivedCatalog("hvac", version)).rejects.toThrow(
    "impronta",
  );
  expect(() => history.readArchivedCatalog("hvac", version)).toThrow(
    "Caricare",
  );
  fetch.mockImplementation(
    async () => new Response(new Uint8Array(await bytes())),
  );
  await expect(
    history.loadArchivedCatalog("hvac", version),
  ).resolves.toMatchObject({ version });
  for (const missing of ["missing-version", "__proto__", "constructor"]) {
    expect(history.readArchivedCatalog("hvac", missing)).toBeNull();
    await expect(
      history.loadArchivedCatalog("hvac", missing),
    ).resolves.toBeNull();
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});
