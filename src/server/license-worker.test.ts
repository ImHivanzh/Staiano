import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { hashLicenseKey, verifyLicenseToken } from "@/domain/license/token";
import worker from "../../license-server/src/index";

/**
 * Verifica del Worker Cloudflare contro un vero motore SQLite (`node:sqlite`):
 * schema, contabilità delle postazioni, revoca e firma dei token.
 */
type WorkerEnv = Parameters<typeof worker.fetch>[1];

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
const publicKeyPem = publicKey.export({
  type: "spki",
  format: "pem",
}) as string;
const ADMIN_TOKEN = "token-amministrativo-di-prova";
const MACHINE_A = `mch_${"a".repeat(32)}`;
const MACHINE_B = `mch_${"b".repeat(32)}`;

function statement(db: DatabaseSync, query: string, bound: unknown[] = []) {
  const prepared = db.prepare(query);
  return {
    bind: (...values: unknown[]) => statement(db, query, values),
    first: async () => prepared.get(...(bound as never[])) ?? null,
    all: async () => ({
      results: prepared.all(...(bound as never[])),
      success: true,
    }),
    run: async () => {
      prepared.run(...(bound as never[]));
      return { success: true };
    },
  };
}

function makeEnv(
  options: { privateKey?: boolean; adminToken?: boolean } = {},
): { env: WorkerEnv; db: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("license-server/schema.sql", "utf8"));
  const env = {
    DB: {
      prepare: (query: string) => statement(db, query),
      batch: async (statements: unknown[]) => statements,
    },
    LICENSE_PRIVATE_KEY:
      options.privateKey === false ? undefined : privateKeyPem,
    ADMIN_TOKEN: options.adminToken === false ? undefined : ADMIN_TOKEN,
  } as unknown as WorkerEnv;
  return { env, db };
}

function call(
  env: WorkerEnv,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string;
    raw?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const body = init.raw ?? (init.body ? JSON.stringify(init.body) : undefined);
  return worker.fetch(
    new Request(`https://licenze.test${path}`, {
      method: init.method ?? "GET",
      headers,
      body,
    }),
    env,
  );
}

async function createLicense(
  env: WorkerEnv,
  options: Record<string, unknown> = {},
) {
  const response = await call(env, "/admin/licenses", {
    method: "POST",
    token: ADMIN_TOKEN,
    body: { customer: "Cliente Test", ...options },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    key: string;
    license: { id: string; customer: string; seats: number };
  };
}

let env: WorkerEnv;
let db: DatabaseSync;

beforeEach(() => {
  ({ env, db } = makeEnv());
});

describe("Worker licenze — servizio", () => {
  it("risponde al controllo di salute e respinge tutto il resto", async () => {
    const health = await call(env, "/health");
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({ ok: true });
    expect((await call(env, "/sconosciuto")).status).toBe(404);
    expect((await call(env, "/activate")).status).toBe(405);
  });

  it("senza chiave di firma le rotte pubbliche rispondono 503", async () => {
    const { env: bare } = makeEnv({ privateKey: false });
    const response = await call(bare, "/activate", {
      method: "POST",
      body: {
        licenseKey: "STAIANO-00000-00000-00000-00000",
        machineId: MACHINE_A,
      },
    });
    expect(response.status).toBe(503);
  });

  it("protegge le rotte amministrative con il token", async () => {
    expect((await call(env, "/admin/licenses")).status).toBe(401);
    expect(
      (await call(env, "/admin/licenses", { token: "sbagliato" })).status,
    ).toBe(401);
    const { env: noToken } = makeEnv({ adminToken: false });
    expect((await call(noToken, "/admin/licenses")).status).toBe(503);
    expect(
      (await call(env, "/admin/licenses", { token: ADMIN_TOKEN })).status,
    ).toBe(200);
  });
});

describe("Worker licenze — emissione", () => {
  it("crea una licenza conservando solo l'hash della chiave", async () => {
    const created = await createLicense(env, {
      seats: 2,
      notes: "prima fornitura",
    });
    expect(created.key).toMatch(/^STAIANO(-[0-9A-Z]{5}){4}$/);
    expect(created.license).toMatchObject({
      customer: "Cliente Test",
      seats: 2,
    });
    const row = db
      .prepare("SELECT key_hash, customer, status FROM licenses")
      .get() as { key_hash: string; customer: string; status: string };
    expect(row.key_hash).toBe(await hashLicenseKey(created.key));
    expect(row.key_hash).not.toContain(created.key);
    expect(row).toMatchObject({ customer: "Cliente Test", status: "active" });
  });

  it("valida i dati di attivazione", async () => {
    const created = await createLicense(env);
    const unknown = await call(env, "/activate", {
      method: "POST",
      body: {
        licenseKey: "STAIANO-11111-11111-11111-11111",
        machineId: MACHINE_A,
      },
    });
    expect(unknown.status).toBe(404);
    const badMachine = await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: "pc-di-casa" },
    });
    expect(badMachine.status).toBe(400);
    const badKey = await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: "chiave storta", machineId: MACHINE_A },
    });
    expect(badKey.status).toBe(400);
  });
});

describe("Worker licenze — attivazione e postazioni", () => {
  it("attiva la postazione con un token verificabile offline", async () => {
    const created = await createLicense(env);
    const response = await call(env, "/activate", {
      method: "POST",
      body: {
        licenseKey: created.key,
        machineId: MACHINE_A,
        hostname: "SERVER-STAIANOP",
        appVersion: "1.1.0",
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    const payload = await verifyLicenseToken(body.token, publicKeyPem);
    expect(payload).toMatchObject({
      licenseId: created.license.id,
      customer: "Cliente Test",
      plan: "standard",
      seats: 1,
      machineId: MACHINE_A,
      features: ["configurator"],
      expiresAt: null,
    });
    const activation = db
      .prepare("SELECT hostname, app_version, released_at FROM activations")
      .get() as Record<string, unknown>;
    expect(activation).toMatchObject({
      hostname: "SERVER-STAIANOP",
      app_version: "1.1.0",
      released_at: null,
    });
  });

  it("rinnova il token e rispetta il numero di postazioni", async () => {
    const created = await createLicense(env);
    await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    const renewed = await call(env, "/verify", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    expect(renewed.status).toBe(200);
    const payload = await verifyLicenseToken(
      ((await renewed.json()) as { token: string }).token,
      publicKeyPem,
    );
    expect(payload?.machineId).toBe(MACHINE_A);

    const otherSeat = await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_B },
    });
    expect(otherSeat.status).toBe(409);
    await expect(otherSeat.json()).resolves.toMatchObject({
      status: "seats-exhausted",
    });
    const notActivated = await call(env, "/verify", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_B },
    });
    expect(notActivated.status).toBe(409);
  });

  it("libera la postazione e consente il trasferimento", async () => {
    const created = await createLicense(env);
    await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    const released = await call(env, "/deactivate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toMatchObject({
      status: "released",
    });
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(env, "/activate", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_B },
        })
      ).status,
    ).toBe(200);
  });
});

describe("Worker licenze — revoca e amministrazione", () => {
  it("blocca le postazioni alla revoca e le sblocca al ripristino", async () => {
    const created = await createLicense(env);
    await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    const revoked = await call(
      env,
      `/admin/licenses/${created.license.id}/revoke`,
      {
        method: "POST",
        token: ADMIN_TOKEN,
      },
    );
    expect(revoked.status).toBe(200);
    const blocked = await call(env, "/verify", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({ status: "revoked" });
    expect(
      (
        await call(env, "/activate", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_B },
        })
      ).status,
    ).toBe(403);

    await call(env, `/admin/licenses/${created.license.id}/restore`, {
      method: "POST",
      token: ADMIN_TOKEN,
    });
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(200);
  });

  it("elenca licenze e attivazioni senza esporre la chiave", async () => {
    const created = await createLicense(env);
    await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A, hostname: "PC-A" },
    });
    const response = await call(env, "/admin/licenses", { token: ADMIN_TOKEN });
    const text = await response.text();
    expect(text).not.toContain(created.key);
    const body = JSON.parse(text) as {
      licenses: Array<{
        id: string;
        status: string;
        activations: Array<Record<string, unknown>>;
      }>;
    };
    expect(body.licenses).toHaveLength(1);
    expect(body.licenses[0]).toMatchObject({
      id: created.license.id,
      status: "active",
    });
    expect(body.licenses[0].activations).toHaveLength(1);
    expect(body.licenses[0].activations[0]).toMatchObject({
      machine_id: MACHINE_A,
      hostname: "PC-A",
    });
  });

  it("libera una postazione su richiesta dell'amministratore", async () => {
    const created = await createLicense(env);
    await call(env, "/activate", {
      method: "POST",
      body: { licenseKey: created.key, machineId: MACHINE_A },
    });
    const released = await call(
      env,
      `/admin/licenses/${created.license.id}/release`,
      { method: "POST", token: ADMIN_TOKEN, body: { machineId: MACHINE_A } },
    );
    expect(released.status).toBe(200);
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(env, `/admin/licenses/lic_inesistente/revoke`, {
          method: "POST",
          token: ADMIN_TOKEN,
        })
      ).status,
    ).toBe(404);
  });
});
