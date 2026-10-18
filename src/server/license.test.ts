import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signLicenseToken,
  type LicenseTokenPayload,
} from "@/domain/license/token";
import {
  activateLicense,
  clearLicenseFile,
  deactivateLicense,
  invalidateLicenseCache,
  LicenseError,
  licenseFilePath,
  licenseSetup,
  licenseStatus,
  machineFingerprint,
  readLicenseFile,
} from "./license";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
const publicKeyPem = publicKey.export({
  type: "spki",
  format: "pem",
}) as string;

let directory = "";
const saved = { ...process.env };

function payload(overrides: Partial<LicenseTokenPayload> = {}) {
  const machineId = machineFingerprint();
  return {
    v: 1,
    licenseId: "lic_test",
    customer: "Termoidraulica Staiano",
    plan: "standard",
    seats: 1,
    machineId,
    features: ["configurator"],
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: null,
    ...overrides,
  } satisfies LicenseTokenPayload;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "staiano-license-"));
  process.env.LICENSE_FILE = join(directory, "license.json");
  process.env.LICENSE_SERVER_URL = "https://license.example.workers.dev";
  process.env.LICENSE_PUBLIC_KEY = publicKeyPem;
  process.env.LICENSE_ENFORCE = "1";
  delete process.env.LICENSE_TOLERANCE_MINUTES;
  delete process.env.LICENSE_CHECK_MINUTES;
  invalidateLicenseCache();
  saved.LICENSE_FILE = process.env.LICENSE_FILE;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  invalidateLicenseCache();
  for (const key of [
    "LICENSE_FILE",
    "LICENSE_SERVER_URL",
    "LICENSE_PUBLIC_KEY",
    "LICENSE_ENFORCE",
    "LICENSE_TOLERANCE_MINUTES",
    "LICENSE_CHECK_MINUTES",
  ]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await rm(directory, { recursive: true, force: true });
});

async function writeToken(
  token: string,
  options: { lastVerifiedAt?: number } = {},
) {
  const machineId = machineFingerprint();
  await writeFile(
    licenseFilePath(),
    JSON.stringify({
      version: 1,
      key: "0123456789ABCDEFGHJK",
      licenseId: "lic_test",
      machineId,
      token,
      serverUrl: "https://license.example.workers.dev",
      customer: "Termoidraulica Staiano",
      plan: "standard",
      activatedAt: Date.now() - 86_400_000,
      lastVerifiedAt: options.lastVerifiedAt ?? Date.now(),
    }),
    "utf8",
  );
}

describe("impronta macchina", () => {
  it("è stabile, distinta e nel formato atteso", () => {
    const first = machineFingerprint(["platform:win32", "host:PC"]);
    const second = machineFingerprint(["platform:win32", "host:PC"]);
    expect(first).toMatch(/^mch_[0-9a-f]{32}$/);
    expect(second).toBe(first);
    expect(machineFingerprint(["platform:win32", "host:ALTRO"])).not.toBe(
      first,
    );
  });

  it("espone la configurazione corrente", async () => {
    const setup = await licenseSetup();
    expect(setup).toMatchObject({
      enforced: true,
      serverUrl: "https://license.example.workers.dev",
      publicKey: true,
      toleranceMinutes: 30,
      checkMinutes: 10,
    });
    expect(setup.machineId).toMatch(/^mch_[0-9a-f]{32}$/);
  });
});

describe("stato della licenza", () => {
  it("non blocca quando il controllo è disattivato", async () => {
    process.env.LICENSE_ENFORCE = "0";
    invalidateLicenseCache();
    const status = await licenseStatus({ force: true });
    expect(status).toMatchObject({
      ok: true,
      state: "disabled",
      enforce: false,
    });
  });

  it("segnala la licenza assente", async () => {
    const status = await licenseStatus({ force: true });
    expect(status).toMatchObject({
      ok: false,
      state: "missing",
      enforce: true,
    });
  });

  it("riconosce un token valido e aggiornato", async () => {
    await writeToken(await signLicenseToken(payload(), privateKeyPem));
    const status = await licenseStatus({ force: true });
    expect(status).toMatchObject({
      ok: true,
      state: "active",
      customer: "Termoidraulica Staiano",
      licenseId: "lic_test",
    });
  });

  it("rifiuta un token alterato o di un'altra macchina", async () => {
    await writeToken(
      await signLicenseToken(
        payload({ machineId: "mch_ffffffffffffffffffffffffffffffff" }),
        privateKeyPem,
      ),
    );
    expect(await licenseStatus({ force: true })).toMatchObject({
      ok: false,
      state: "invalid",
    });
    await writeToken("corpo.firma");
    expect(await licenseStatus({ force: true })).toMatchObject({
      ok: false,
      state: "invalid",
    });
  });

  it("rifiuta una licenza scaduta", async () => {
    await writeToken(
      await signLicenseToken(
        payload({ expiresAt: Math.floor(Date.now() / 1000) - 60 }),
        privateKeyPem,
      ),
    );
    expect(await licenseStatus({ force: true })).toMatchObject({
      ok: false,
      state: "expired",
    });
  });

  it("evita la rete finché il token è fresco e la usa quando scade la tolleranza", async () => {
    await writeToken(await signLicenseToken(payload(), privateKeyPem), {
      lastVerifiedAt: Date.now(),
    });
    const fresh = vi.fn();
    vi.stubGlobal("fetch", fresh);
    invalidateLicenseCache();
    expect(await licenseStatus({ force: true })).toMatchObject({ ok: true });
    expect(fresh).not.toHaveBeenCalled();

    process.env.LICENSE_TOLERANCE_MINUTES = "30";
    await writeToken(await signLicenseToken(payload(), privateKeyPem), {
      lastVerifiedAt: Date.now() - 60 * 60_000,
    });
    const unreachable = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", unreachable);
    invalidateLicenseCache();
    const status = await licenseStatus({ force: true });
    expect(status).toMatchObject({ ok: false, state: "unreachable" });
    expect(unreachable).toHaveBeenCalledOnce();
  });

  it("si sblocca quando il server conferma la licenza dopo una caduta di rete", async () => {
    await writeToken(await signLicenseToken(payload(), privateKeyPem), {
      lastVerifiedAt: Date.now() - 60 * 60_000,
    });
    const fresh = await signLicenseToken(
      payload({ issuedAt: Math.floor(Date.now() / 1000) }),
      privateKeyPem,
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ status: "active", token: fresh })),
    );
    invalidateLicenseCache();
    expect(await licenseStatus({ force: true })).toMatchObject({
      ok: true,
      state: "active",
    });
    const stored = await readLicenseFile();
    expect(stored?.token).toBe(fresh);
  });

  it("si blocca se il server revoca la licenza e cancella il token", async () => {
    await writeToken(await signLicenseToken(payload(), privateKeyPem), {
      lastVerifiedAt: Date.now() - 60 * 60_000,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { status: "revoked", message: "Licenza disattivata." },
            403,
          ),
        ),
    );
    invalidateLicenseCache();
    expect(await licenseStatus({ force: true })).toMatchObject({
      ok: false,
      state: "revoked",
      message: "Licenza disattivata.",
    });
    expect(await readLicenseFile()).toBeNull();
  });
});

describe("attivazione", () => {
  it("attiva la postazione e salva il token firmato", async () => {
    const token = await signLicenseToken(payload(), privateKeyPem);
    const call = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: "active", token }));
    vi.stubGlobal("fetch", call);
    const status = await activateLicense("STAIANO-01234-56789-ABCDE-FGHJK");
    expect(status).toMatchObject({ ok: true, state: "active" });
    const [url, init] = call.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://license.example.workers.dev/activate");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      licenseKey: "0123456789ABCDEFGHJK",
      hostname: expect.any(String),
    });
    expect(body.machineId).toBe(machineFingerprint());
    expect(await readLicenseFile()).toMatchObject({ licenseId: "lic_test" });
  });

  it("rifiuta chiavi non valide e risposte incoerenti", async () => {
    await expect(activateLicense("chiave-storta")).rejects.toBeInstanceOf(
      LicenseError,
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { status: "seats-exhausted", message: "Già attiva altrove." },
            409,
          ),
        ),
    );
    await expect(activateLicense("0123456789ABCDEFGHJK")).rejects.toThrow(
      "Già attiva altrove.",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: "active",
          token: await signLicenseToken(
            payload({ machineId: "mch_ffffffffffffffffffffffffffffffff" }),
            privateKeyPem,
          ),
        }),
      ),
    );
    await expect(activateLicense("0123456789ABCDEFGHJK")).rejects.toThrow(
      "Risposta del server licenze non valida.",
    );
  });

  it("segnala il server non raggiungibile", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(activateLicense("0123456789ABCDEFGHJK")).rejects.toThrow(
      "Server licenze non raggiungibile",
    );
  });

  it("libera la postazione solo dopo conferma del server", async () => {
    await writeToken(await signLicenseToken(payload(), privateKeyPem));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(deactivateLicense()).rejects.toThrow(
      "la postazione non è stata liberata",
    );
    expect(await readLicenseFile()).not.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "released" })),
    );
    await expect(deactivateLicense()).resolves.toMatchObject({
      state: "missing",
      ok: false,
    });
    expect(await readLicenseFile()).toBeNull();
    await clearLicenseFile();
  });
});

it("non estende la tolleranza offline cambiando la data del file locale", async () => {
  await writeToken(
    await signLicenseToken(
      payload({ issuedAt: Math.floor(Date.now() / 1000) - 7200 }),
      privateKeyPem,
    ),
    { lastVerifiedAt: Date.now() + 86400000 },
  );
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await licenseStatus({ force: true })).toMatchObject({
    ok: false,
    state: "unreachable",
  });
});

it("conserva la licenza se il server rifiuta la disattivazione", async () => {
  await writeToken(await signLicenseToken(payload(), privateKeyPem));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(jsonResponse({ message: "errore" }, 500)),
  );
  await expect(deactivateLicense()).rejects.toThrow("non è stata liberata");
  expect(await readLicenseFile()).not.toBeNull();
});

it("rifiuta un token firmato valido emesso per un altro software", async () => {
  await writeToken(
    await signLicenseToken(
      payload({ productId: "altro-software" }),
      privateKeyPem,
    ),
  );
  expect(await licenseStatus({ force: true })).toMatchObject({
    ok: false,
    state: "invalid",
  });
});
