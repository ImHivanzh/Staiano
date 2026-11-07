import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostStatus, isHostAction, requestHostAction } from "./host-maintenance";

const { hostRequest } = createRequire(import.meta.url)(
  "../../deploy/executable.cjs",
);
const roots: string[] = [];
async function dataRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "staiano-host-"));
  roots.push(root);
  await mkdir(path.join(root, ".cache"));
  return root;
}
const request = (root: string) => path.join(root, ".cache", "host-request.json");

afterEach(async () => {
  delete process.env.HOST_REQUEST_FILE;
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe("richieste al computer host", () => {
  it("accetta solo azioni note", () => {
    expect(isHostAction("anydesk")).toBe(true);
    expect(isHostAction("reboot")).toBe(true);
    expect(isHostAction("format c:")).toBe(false);
  });

  it("scrive la richiesta e la esegue una sola volta", async () => {
    const root = await dataRoot();
    process.env.HOST_REQUEST_FILE = request(root);
    await requestHostAction("anydesk", "admin");
    expect((await hostStatus()).pending.action).toBe("anydesk");
    const run = vi.fn();
    expect(hostRequest(root, run).ok).toBe(true);
    expect(run).toHaveBeenCalledWith("anydesk");
    expect(existsSync(request(root))).toBe(false);
    expect(hostRequest(root, run)).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect((await hostStatus()).last.ok).toBe(true);
  });

  it("scarta richieste vecchie, sconosciute o corrotte", async () => {
    const root = await dataRoot();
    const run = vi.fn();
    for (const body of [
      JSON.stringify({ action: "reboot", requestedAt: new Date(Date.now() - 3_600_000).toISOString() }),
      JSON.stringify({ action: "rm -rf", requestedAt: new Date().toISOString() }),
      "{non json",
    ]) {
      await writeFile(request(root), body);
      expect(hostRequest(root, run).ok).toBe(false);
      expect(existsSync(request(root))).toBe(false);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("registra l'errore se il comando fallisce", async () => {
    const root = await dataRoot();
    await writeFile(request(root), JSON.stringify({ action: "anydesk", requestedAt: new Date().toISOString() }));
    const result = hostRequest(root, () => { throw new Error("servizio assente"); });
    expect(result).toMatchObject({ ok: false, error: "servizio assente" });
    expect(JSON.parse(await readFile(path.join(root, ".cache", "host-request-result.json"), "utf8")).ok).toBe(false);
  });
});

describe("comando remoto firmato", () => {
  const { verifyHostCommand } = createRequire(import.meta.url)("../../deploy/executable.cjs");
  const { generateKeyPairSync, sign } = createRequire(import.meta.url)("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const machine = `mch_${"a".repeat(32)}`, nonce = "d".repeat(64);
  const token = (over = {}, prefix = "staiano-host-v1") => {
    const now = Math.floor(Date.now() / 1000);
    const encoded = Buffer.from(JSON.stringify({ v: 1, app: "staiano-hvac", id: "x", action: "reboot", machineId: machine, nonce, issuedAt: now, expiresAt: now + 300, ...over })).toString("base64url");
    return `${encoded}.${sign(null, Buffer.from(`${prefix}.${encoded}`), privateKey).toString("base64url")}`;
  };
  it("accetta un comando valido", () => {
    expect(verifyHostCommand(token(), publicKey, machine, nonce).action).toBe("reboot");
  });
  it.each([
    ["altra postazione", token({ machineId: `mch_${"b".repeat(32)}` })],
    ["nonce diverso", token({ nonce: "e".repeat(64) })],
    ["azione sconosciuta", token({ action: "format" })],
    ["scaduto", token({ expiresAt: 1, issuedAt: 0 })],
    ["firma di un altro tipo di messaggio", token({}, "staiano-update-v1")],
  ])("rifiuta: %s", (_, bad) => {
    expect(() => verifyHostCommand(bad, publicKey, machine, nonce)).toThrow();
  });
});
