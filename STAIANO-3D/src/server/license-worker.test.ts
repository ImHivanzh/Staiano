import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
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
    expect(created.key).toMatch(/^LIC(-[0-9A-Z]{5}){4}$/);
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

describe("Worker licenze — regressioni e pannello", () => {
  it("accetta pacchetti solo dal publisher e dalla revisione corrente di GitLab", async () => {
    env.PUBLISH_TOKEN = "publisher-di-prova";
    env.GITLAB_READ_TOKEN = "read-only-di-prova";
    env.GITLAB_READ_USERNAME = "gitlab+deploy-token-test";
    const commit = "c".repeat(40);
    const fetchHead = vi.fn().mockImplementation(
      async () =>
        new Response(`0040${commit} refs/heads/main\n`, {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchHead);
    const body = {
      commit,
      sha256: "d".repeat(64),
      size: 10,
      url: `https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/${commit}/StaianoHVAC.exe`,
    };
    expect((await call(env, "/publish", { method: "POST", body })).status).toBe(
      401,
    );
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body: {
            ...body,
            commit: "b".repeat(40),
            url: `https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/${"b".repeat(40)}/StaianoHVAC.exe`,
          },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body,
        })
      ).status,
    ).toBe(200);
    expect(fetchHead).toHaveBeenCalledWith(
      "https://gitlab.com/imhivanzh/Staiano3D.git/info/refs?service=git-upload-pack",
      expect.objectContaining({
        headers: {
          Authorization: `Basic ${btoa("gitlab+deploy-token-test:read-only-di-prova")}`,
        },
        redirect: "manual",
      }),
    );
    db.prepare("UPDATE releases SET url = ? WHERE commit_sha = ?").run(
      "https://retired.invalid/package.exe",
      commit,
    );
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body,
        })
      ).status,
    ).toBe(200);
    expect(
      db
        .prepare("SELECT sequence, url FROM releases WHERE commit_sha = ?")
        .get(commit),
    ).toMatchObject({ sequence: 1, url: body.url });
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body: { ...body, sha256: "f".repeat(64) },
        })
      ).status,
    ).toBe(409);
    const status = await call(env, "/publish/status", {
      token: env.PUBLISH_TOKEN,
    });
    expect(await status.json()).toMatchObject({ commit });
  });
  it("rifiuta redirect e revisioni GitLab inaccessibili prima di registrare un pacchetto", async () => {
    env.PUBLISH_TOKEN = "publisher-di-prova";
    env.GITLAB_READ_TOKEN = "read-only-di-prova";
    env.GITLAB_READ_USERNAME = "gitlab+deploy-token-test";
    const commit = "c".repeat(40);
    const fetchHead = vi.fn().mockImplementation(async (_url, init) => {
      if (init.redirect !== "manual")
        throw new TypeError("Cloudflare requires manual redirect handling");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/" },
      });
    });
    vi.stubGlobal("fetch", fetchHead);
    const body = {
      commit,
      sha256: "d".repeat(64),
      size: 10,
      url: `https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/${commit}/StaianoHVAC.exe`,
    };
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body,
        })
      ).status,
    ).toBe(503);
    fetchHead.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(
      (
        await call(env, "/publish", {
          method: "POST",
          token: env.PUBLISH_TOKEN,
          body,
        })
      ).status,
    ).toBe(503);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM releases").get(),
    ).toMatchObject({ count: 0 });
  });
  it("scarica solo dal pacchetto GitLab previsto e non espone il deploy token nei redirect", async () => {
    const created = await createLicense(env);
    const body = {
      licenseKey: created.key,
      machineId: MACHINE_A,
      nonce: "b".repeat(64),
      sequence: 1,
    };
    await call(env, "/activate", { method: "POST", body });
    const commit = "c".repeat(40);
    const url = `https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/${commit}/StaianoHVAC.exe`;
    db.prepare(
      "INSERT INTO releases (commit_sha, sha256, size, url, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(commit, "d".repeat(64), 3, url, new Date().toISOString());
    env.GITLAB_READ_TOKEN = "read-only-di-prova";
    const upstream = vi.fn().mockResolvedValueOnce(new Response("exe"));
    vi.stubGlobal("fetch", upstream);
    expect(
      await (
        await call(env, "/updates/download", { method: "POST", body })
      ).text(),
    ).toBe("exe");
    expect(upstream).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: { "DEPLOY-TOKEN": "read-only-di-prova" },
        redirect: "manual",
      }),
    );
    upstream.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/package" },
      }),
    );
    expect(
      (await call(env, "/updates/download", { method: "POST", body })).status,
    ).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(2);
    db.prepare("UPDATE releases SET url = ?").run(url.replace("87880568", "1"));
    expect(
      (await call(env, "/updates/download", { method: "POST", body })).status,
    ).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(2);
    db.prepare("UPDATE releases SET url = ?").run(url);
    delete env.GITLAB_READ_TOKEN;
    expect(
      (await call(env, "/updates/download", { method: "POST", body })).status,
    ).toBe(503);
  });
  it("protegge registrazione passkey, origine e challenge monouso", async () => {
    env.PASSKEY_ORIGIN = "https://licenze.test";
    const send = (
      path: string,
      body: unknown,
      token?: string,
      origin = "https://licenze.test",
    ) =>
      worker.fetch(
        new Request(`https://licenze.test${path}`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        }),
        env,
      );
    expect((await send("/admin/passkeys/register/options", {})).status).toBe(
      401,
    );
    expect(
      (await send("/auth/login/options", {}, undefined, "https://evil.test"))
        .status,
    ).toBe(403);
    const options = await send("/auth/login/options", {});
    const body = (await options.json()) as { challengeId: string };
    expect(options.status).toBe(200);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM passkey_challenges").get()?.n,
    ).toBe(1);
    const invalid = {
      challengeId: body.challengeId,
      response: { id: "unknown" },
    };
    expect((await send("/auth/login/verify", invalid)).status).toBe(401);
    expect((await send("/auth/login/verify", invalid)).status).toBe(400);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM admin_sessions").get()?.n,
    ).toBe(0);
  });
  it("gestisce più software e impedisce di usare una licenza su un prodotto diverso", async () => {
    expect((await call(env, "/admin/products")).status).toBe(401);
    expect(
      (
        await call(env, "/admin/products", {
          method: "POST",
          token: ADMIN_TOKEN,
          body: { id: "gestionale-clienti", name: "Gestionale clienti" },
        })
      ).status,
    ).toBe(201);
    const created = await createLicense(env, {
      productId: "gestionale-clienti",
    });
    const body = { licenseKey: created.key, machineId: MACHINE_A };
    expect(
      (await call(env, "/activate", { method: "POST", body })).status,
    ).toBe(404);
    const response = await call(env, "/activate", {
      method: "POST",
      body: { ...body, productId: "gestionale-clienti" },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { token: string };
    expect(await verifyLicenseToken(result.token, publicKeyPem)).toMatchObject({
      productId: "gestionale-clienti",
    });
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { ...body, productId: "staiano-hvac" },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(env, "/deactivate", {
          method: "POST",
          body: { ...body, productId: "staiano-hvac" },
        })
      ).status,
    ).toBe(404);
  });
  it("non riattiva un posto liberato quando il nuovo occupa tutta la licenza", async () => {
    const created = await createLicense(env);
    for (const [endpoint, machineId] of [
      ["activate", MACHINE_A],
      ["deactivate", MACHINE_A],
      ["activate", MACHINE_B],
    ] as const)
      expect(
        (
          await call(env, `/${endpoint}`, {
            method: "POST",
            body: { licenseKey: created.key, machineId },
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await call(env, "/activate", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(409);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM activations WHERE released_at IS NULL",
        )
        .get()?.n,
    ).toBe(1);
  });
  it("rispetta i posti anche per richieste concorrenti", async () => {
    const created = await createLicense(env);
    const results = await Promise.all(
      [MACHINE_A, MACHINE_B].map((machineId) =>
        call(env, "/activate", {
          method: "POST",
          body: { licenseKey: created.key, machineId },
        }),
      ),
    );
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
  });
  it("modifica dati e ruota la chiave senza esporre quella precedente", async () => {
    const created = await createLicense(env);
    const endpoint = `/admin/licenses/${created.license.id}`;
    const body = {
      customer: "Nuovo cliente",
      seats: 2,
      plan: "pro",
      features: "configurator",
      notes: "nota",
    };
    expect(
      (await call(env, endpoint, { method: "PATCH", token: ADMIN_TOKEN, body }))
        .status,
    ).toBe(200);
    expect(
      db.prepare("SELECT customer, seats FROM licenses").get(),
    ).toMatchObject({ customer: "Nuovo cliente", seats: 2 });
    const response = await call(env, `${endpoint}/rotate`, {
      method: "POST",
      token: ADMIN_TOKEN,
    });
    const rotated = (await response.json()) as { key: string };
    expect(rotated.key).not.toBe(created.key);
    expect(
      (
        await call(env, "/activate", {
          method: "POST",
          body: { licenseKey: created.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(env, "/activate", {
          method: "POST",
          body: { licenseKey: rotated.key, machineId: MACHINE_A },
        })
      ).status,
    ).toBe(200);
  });
  it("non riduce il numero di posti sotto quelli occupati", async () => {
    const created = await createLicense(env, { seats: 2 });
    for (const machineId of [MACHINE_A, MACHINE_B])
      await call(env, "/activate", {
        method: "POST",
        body: { licenseKey: created.key, machineId },
      });
    expect(
      (
        await call(env, `/admin/licenses/${created.license.id}`, {
          method: "PATCH",
          token: ADMIN_TOKEN,
          body: {
            customer: "Cliente",
            seats: 1,
            plan: "standard",
            features: "configurator",
          },
        })
      ).status,
    ).toBe(409);
  });
  it("limita corpi, numeri di posti e richieste da origini esterne", async () => {
    expect(
      (
        await call(env, "/admin/licenses", {
          method: "POST",
          token: ADMIN_TOKEN,
          body: { customer: "Test", seats: 1.5 },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(env, "/admin/licenses", {
          method: "POST",
          token: ADMIN_TOKEN,
          raw: "x".repeat(17000),
        })
      ).status,
    ).toBe(413);
    const response = await worker.fetch(
      new Request("https://licenze.test/admin/licenses", {
        headers: {
          Origin: "https://evil.test",
          Authorization: `Bearer ${ADMIN_TOKEN}`,
        },
      }),
      env,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    env.API_LIMITER = { limit: async () => ({ success: false }) };
    expect(
      (await call(env, "/verify", { method: "POST", body: {} })).status,
    ).toBe(429);
  });
  it("firma l'aggiornamento soltanto per una licenza e una postazione attive", async () => {
    const created = await createLicense(env);
    const body = {
      licenseKey: created.key,
      machineId: MACHINE_A,
      nonce: "b".repeat(64),
    };
    expect(
      (await call(env, "/updates/check", { method: "POST", body })).status,
    ).toBe(403);
    await call(env, "/activate", { method: "POST", body });
    expect(
      await (
        await call(env, "/updates/check", { method: "POST", body })
      ).json(),
    ).toMatchObject({ status: "current" });
    db.prepare(
      "INSERT INTO releases (commit_sha, sha256, size, url, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "c".repeat(40),
      "d".repeat(64),
      10,
      "https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/cccccccccccccccccccccccccccccccccccccccc/StaianoHVAC.exe",
      new Date().toISOString(),
    );
    const response = await call(env, "/updates/check", {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { manifest: string };
    const { verifyManifest } = (await import("node:module")).createRequire(
      import.meta.url,
    )("../../deploy/executable.cjs");
    expect(
      verifyManifest(result.manifest, publicKeyPem, MACHINE_A, body.nonce),
    ).toMatchObject({ commit: "c".repeat(40), sequence: 1 });
    const publicVersion = await call(env, "/updates/version", {
      method: "POST",
      body: { machineId: MACHINE_B, nonce: body.nonce },
    });
    expect(publicVersion.status).toBe(200);
    expect(
      verifyManifest(
        ((await publicVersion.json()) as { manifest: string }).manifest,
        publicKeyPem,
        MACHINE_B,
        body.nonce,
      ),
    ).toMatchObject({ commit: "c".repeat(40) });
    expect(
      (
        await call(env, "/updates/download", {
          method: "POST",
          body: { machineId: MACHINE_B, nonce: body.nonce, sequence: 1 },
        })
      ).status,
    ).toBe(400);
    await call(env, `/admin/licenses/${created.license.id}/revoke`, {
      method: "POST",
      token: ADMIN_TOKEN,
    });
    expect(
      (await call(env, "/updates/check", { method: "POST", body })).status,
    ).toBe(403);
  });
  it("nega la verifica alle vecchie versioni mantenendo disponibile l'aggiornamento", async () => {
    const created = await createLicense(env);
    const body = { licenseKey: created.key, machineId: MACHINE_A };
    await call(env, "/activate", { method: "POST", body });
    const commit = "c".repeat(40);
    db.prepare(
      "INSERT INTO releases (commit_sha, sha256, size, url, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      commit,
      "d".repeat(64),
      10,
      "https://gitlab.com/api/v4/projects/87880568/packages/generic/staiano-hvac/cccccccccccccccccccccccccccccccccccccccc/StaianoHVAC.exe",
      new Date().toISOString(),
    );
    for (const appVersion of [undefined, "1.0.0", "a".repeat(40)]) {
      const response = await call(env, "/verify", {
        method: "POST",
        body: { ...body, appVersion },
      });
      expect(response.status).toBe(426);
      expect(await response.json()).toMatchObject({
        status: "update-required",
        requiredCommit: commit,
      });
    }
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { ...body, appVersion: "1.0.0", packaged: false },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(env, "/verify", {
          method: "POST",
          body: { ...body, appVersion: commit },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(env, "/updates/check", {
          method: "POST",
          body: { ...body, nonce: "b".repeat(64) },
        })
      ).status,
    ).toBe(200);
  });
});
