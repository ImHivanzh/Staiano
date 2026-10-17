/**
 * Servizio licenze — Cloudflare Worker + D1.
 *
 * Servizio generale: una licenza appartiene a un cliente e a una o più
 * postazioni, qualunque sia il software che la usa. Il Worker è l'unico
 * detentore della chiave privata di firma: rilascia token Ed25519 che l'app
 * locale verifica offline, e decide attivazioni e revoche.
 *
 * Endpoint pubblici  POST /activate · POST /verify · POST /deactivate · GET /health
 * Endpoint amministrativi (Bearer ADMIN_TOKEN)
 *   POST /admin/licenses                     crea una licenza e restituisce la chiave
 *   GET  /admin/licenses                     elenca licenze e attivazioni
 *   POST /admin/licenses/:id/revoke          disattiva la licenza su ogni macchina
 *   POST /admin/licenses/:id/restore         riattiva una licenza revocata
 *   POST /admin/licenses/:id/release         libera una postazione
 */
import {
  LICENSE_TOKEN_VERSION,
  formatLicenseKey,
  generateLicenseKey,
  hashLicenseKey,
  isMachineId,
  normalizeLicenseKey,
  signLicenseToken,
  type LicenseTokenPayload,
} from "../../src/domain/license/token";

type D1Result<T> = { results?: T[]; success?: boolean };
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
};
type D1DatabaseLike = {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
};
type Env = {
  DB: D1DatabaseLike;
  LICENSE_PRIVATE_KEY?: string;
  ADMIN_TOKEN?: string;
};

type LicenseRow = {
  id: string;
  customer: string;
  plan: string;
  seats: number;
  status: string;
  features: string;
  notes: string | null;
  created_at: string;
  revoked_at: string | null;
};
type ActivationRow = {
  license_id: string;
  machine_id: string;
  hostname: string | null;
  app_version: string | null;
  first_seen: string;
  last_seen: string;
  released_at: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const count = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;

function licensePayload(
  license: LicenseRow,
  machineId: string,
  now: number,
): LicenseTokenPayload {
  return {
    v: LICENSE_TOKEN_VERSION,
    licenseId: license.id,
    customer: license.customer,
    plan: license.plan,
    seats: license.seats,
    machineId,
    features: license.features
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean),
    issuedAt: now,
    expiresAt: null,
  };
}

async function issueToken(
  env: Env,
  license: LicenseRow,
  machineId: string,
): Promise<string> {
  return signLicenseToken(
    licensePayload(license, machineId, Math.floor(Date.now() / 1000)),
    env.LICENSE_PRIVATE_KEY!,
  );
}

async function findLicense(env: Env, key: string): Promise<LicenseRow | null> {
  const hash = await hashLicenseKey(key);
  return env.DB.prepare("SELECT * FROM licenses WHERE key_hash = ?")
    .bind(hash)
    .first<LicenseRow>();
}

async function activeActivations(env: Env, licenseId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM activations WHERE license_id = ? AND released_at IS NULL",
  )
    .bind(licenseId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

async function activation(
  env: Env,
  licenseId: string,
  machineId: string,
): Promise<ActivationRow | null> {
  return env.DB.prepare(
    "SELECT * FROM activations WHERE license_id = ? AND machine_id = ?",
  )
    .bind(licenseId, machineId)
    .first<ActivationRow>();
}

async function touchActivation(
  env: Env,
  licenseId: string,
  machineId: string,
  hostname: string,
  appVersion: string,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE activations SET last_seen = ?, hostname = COALESCE(NULLIF(?, ''), hostname), app_version = COALESCE(NULLIF(?, ''), app_version) WHERE license_id = ? AND machine_id = ?",
  )
    .bind(new Date().toISOString(), hostname, appVersion, licenseId, machineId)
    .run();
}

async function handleActivate(env: Env, request: Request): Promise<Response> {
  const body = await readBody(request);
  const key = normalizeLicenseKey(text(body.licenseKey));
  const machineId = text(body.machineId);
  if (!key)
    return json(
      { status: "invalid", message: "Chiave di licenza non valida." },
      400,
    );
  if (!isMachineId(machineId))
    return json(
      { status: "invalid", message: "Identificativo macchina non valido." },
      400,
    );
  const license = await findLicense(env, key);
  if (!license)
    return json(
      { status: "unknown", message: "Licenza non riconosciuta." },
      404,
    );
  if (license.status !== "active")
    return json(
      { status: "revoked", message: "Licenza disattivata dal server." },
      403,
    );
  const hostname = text(body.hostname),
    appVersion = text(body.appVersion);
  const existing = await activation(env, license.id, machineId);
  if (existing) {
    await env.DB.prepare(
      "UPDATE activations SET released_at = NULL WHERE license_id = ? AND machine_id = ?",
    )
      .bind(license.id, machineId)
      .run();
    await touchActivation(env, license.id, machineId, hostname, appVersion);
  } else {
    if ((await activeActivations(env, license.id)) >= license.seats)
      return json(
        {
          status: "seats-exhausted",
          message:
            "Licenza già attiva su un'altra postazione. Disattivare quella precedente per spostarla.",
        },
        409,
      );
    await env.DB.prepare(
      "INSERT INTO activations (license_id, machine_id, hostname, app_version, first_seen, last_seen, released_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
    )
      .bind(
        license.id,
        machineId,
        hostname,
        appVersion,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
  }
  return json({
    status: "active",
    token: await issueToken(env, license, machineId),
    license: {
      id: license.id,
      customer: license.customer,
      plan: license.plan,
      seats: license.seats,
    },
  });
}

async function handleVerify(env: Env, request: Request): Promise<Response> {
  const body = await readBody(request);
  const key = normalizeLicenseKey(text(body.licenseKey));
  const machineId = text(body.machineId);
  if (!key || !isMachineId(machineId))
    return json(
      { status: "invalid", message: "Richiesta di verifica non valida." },
      400,
    );
  const license = await findLicense(env, key);
  if (!license)
    return json(
      { status: "unknown", message: "Licenza non riconosciuta." },
      404,
    );
  if (license.status !== "active")
    return json(
      {
        status: "revoked",
        message: "Licenza disattivata dal server. Contattare l'assistenza.",
      },
      403,
    );
  const existing = await activation(env, license.id, machineId);
  if (!existing || existing.released_at)
    return json(
      {
        status: "not-activated",
        message: "Postazione non attiva per questa licenza.",
      },
      409,
    );
  await touchActivation(
    env,
    license.id,
    machineId,
    text(body.hostname),
    text(body.appVersion),
  );
  return json({
    status: "active",
    token: await issueToken(env, license, machineId),
    license: {
      id: license.id,
      customer: license.customer,
      plan: license.plan,
      seats: license.seats,
    },
  });
}

async function handleDeactivate(env: Env, request: Request): Promise<Response> {
  const body = await readBody(request);
  const key = normalizeLicenseKey(text(body.licenseKey));
  const machineId = text(body.machineId);
  if (!key || !isMachineId(machineId))
    return json(
      { status: "invalid", message: "Richiesta di disattivazione non valida." },
      400,
    );
  const license = await findLicense(env, key);
  if (!license)
    return json(
      { status: "unknown", message: "Licenza non riconosciuta." },
      404,
    );
  await env.DB.prepare(
    "UPDATE activations SET released_at = ? WHERE license_id = ? AND machine_id = ?",
  )
    .bind(new Date().toISOString(), license.id, machineId)
    .run();
  return json({ status: "released" });
}

function adminAuthorized(env: Env, request: Request): boolean {
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

async function listLicenses(env: Env): Promise<Response> {
  const licenses =
    (
      await env.DB.prepare(
        "SELECT * FROM licenses ORDER BY created_at DESC",
      ).all<LicenseRow>()
    ).results ?? [];
  const activations =
    (
      await env.DB.prepare(
        "SELECT * FROM activations ORDER BY last_seen DESC",
      ).all<ActivationRow>()
    ).results ?? [];
  return json({
    licenses: licenses.map((license) => ({
      id: license.id,
      customer: license.customer,
      plan: license.plan,
      seats: license.seats,
      status: license.status,
      features: license.features,
      notes: license.notes,
      createdAt: license.created_at,
      revokedAt: license.revoked_at,
      activations: activations.filter((item) => item.license_id === license.id),
    })),
  });
}

async function handleAdmin(
  env: Env,
  request: Request,
  pathname: string,
): Promise<Response> {
  if (!env.ADMIN_TOKEN)
    return json(
      { message: "Token amministrativo non configurato sul Worker." },
      503,
    );
  if (!adminAuthorized(env, request))
    return json({ message: "Autorizzazione richiesta." }, 401);

  if (pathname === "/admin/licenses" && request.method === "POST") {
    const body = await readBody(request);
    const customer = text(body.customer);
    if (!customer)
      return json({ message: "Indicare il cliente della licenza." }, 400);
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const key = formatLicenseKey(generateLicenseKey(random));
    const license: LicenseRow = {
      id: `lic_${[...random.slice(0, 8)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")}`,
      customer,
      plan: text(body.plan) || "standard",
      seats: count(body.seats, 1),
      status: "active",
      features: text(body.features) || "configurator",
      notes: text(body.notes) || null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    await env.DB.prepare(
      "INSERT INTO licenses (id, key_hash, customer, plan, seats, status, features, notes, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
    )
      .bind(
        license.id,
        await hashLicenseKey(key),
        license.customer,
        license.plan,
        license.seats,
        license.status,
        license.features,
        license.notes,
        license.created_at,
      )
      .run();
    return json({ status: "created", key, license }, 201);
  }

  if (pathname === "/admin/licenses" && request.method === "GET")
    return listLicenses(env);

  const action = pathname.match(
    /^\/admin\/licenses\/([A-Za-z0-9_]+)\/(revoke|restore|release)$/,
  );
  if (action && request.method === "POST") {
    const [, id, operation] = action;
    const license = await env.DB.prepare("SELECT * FROM licenses WHERE id = ?")
      .bind(id)
      .first<LicenseRow>();
    if (!license) return json({ message: "Licenza inesistente." }, 404);
    if (operation === "revoke") {
      await env.DB.prepare(
        "UPDATE licenses SET status = 'revoked', revoked_at = ? WHERE id = ?",
      )
        .bind(new Date().toISOString(), id)
        .run();
      return json({ status: "revoked", id });
    }
    if (operation === "restore") {
      await env.DB.prepare(
        "UPDATE licenses SET status = 'active', revoked_at = NULL WHERE id = ?",
      )
        .bind(id)
        .run();
      return json({ status: "active", id });
    }
    const body = await readBody(request);
    const machineId = text(body.machineId);
    if (!isMachineId(machineId))
      return json({ message: "Identificativo macchina non valido." }, 400);
    await env.DB.prepare(
      "UPDATE activations SET released_at = ? WHERE license_id = ? AND machine_id = ?",
    )
      .bind(new Date().toISOString(), id, machineId)
      .run();
    return json({ status: "released", id, machineId });
  }

  return json({ message: "Operazione amministrativa non riconosciuta." }, 404);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/health")
        return json({ ok: true, service: "licenses" });
      if (pathname.startsWith("/admin/"))
        return await handleAdmin(env, request, pathname);
      if (!["/activate", "/verify", "/deactivate"].includes(pathname))
        return json({ message: "Endpoint non riconosciuto." }, 404);
      if (!env.LICENSE_PRIVATE_KEY)
        return json(
          { message: "Chiave di firma non configurata sul Worker." },
          503,
        );
      if (request.method !== "POST")
        return json({ message: "Metodo non consentito." }, 405);
      if (pathname === "/activate") return await handleActivate(env, request);
      if (pathname === "/verify") return await handleVerify(env, request);
      return await handleDeactivate(env, request);
    } catch (error) {
      return json(
        {
          message:
            error instanceof Error
              ? `Errore del server licenze: ${error.message}`
              : "Errore del server licenze.",
        },
        500,
      );
    }
  },
};

export default worker;
