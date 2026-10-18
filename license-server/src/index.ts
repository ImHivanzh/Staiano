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
  base64UrlEncode,
  pemToDer,
  type LicenseTokenPayload,
} from "../../src/domain/license/token";
import { handlePasskeys, passkeySession } from "./passkeys";

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
export type Env = {
  DB: D1DatabaseLike;
  LICENSE_PRIVATE_KEY?: string;
  ADMIN_TOKEN?: string;
  PUBLISH_TOKEN?: string;
  CODEBERG_READ_TOKEN?: string;
  PASSKEY_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  API_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
};

type LicenseRow = {
  id: string;
  product_id: string;
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
  const reader = request.body?.getReader();
  if (!reader) return {};
  let size = 0;
  let raw = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      raw += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(raw + decoder.decode());
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const validSeats = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 1000;

function licensePayload(
  license: LicenseRow,
  machineId: string,
  now: number,
): LicenseTokenPayload {
  return {
    v: LICENSE_TOKEN_VERSION,
    licenseId: license.id,
    productId: license.product_id,
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

async function findLicense(
  env: Env,
  key: string,
  productId = "staiano-hvac",
): Promise<LicenseRow | null> {
  const hash = await hashLicenseKey(key);
  return env.DB.prepare(
    "SELECT * FROM licenses WHERE key_hash = ? AND product_id = ?",
  )
    .bind(hash, productId)
    .first<LicenseRow>();
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
  const license = await findLicense(
    env,
    key,
    text(body.productId) || "staiano-hvac",
  );
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
  // One statement serializes the capacity check and allocation, including reactivation.
  const allocated = await env.DB.prepare(
    `
    INSERT INTO activations (license_id, machine_id, hostname, app_version, first_seen, last_seen, released_at)
    SELECT id, ?, ?, ?, ?, ?, NULL FROM licenses
    WHERE id = ? AND status = 'active' AND (
      EXISTS (SELECT 1 FROM activations WHERE license_id = licenses.id AND machine_id = ? AND released_at IS NULL)
      OR (SELECT COUNT(*) FROM activations WHERE license_id = licenses.id AND released_at IS NULL) < seats
    )
    ON CONFLICT(license_id, machine_id) DO UPDATE SET
      hostname = excluded.hostname, app_version = excluded.app_version,
      last_seen = excluded.last_seen, released_at = NULL
    RETURNING machine_id
  `,
  )
    .bind(
      machineId,
      hostname.slice(0, 200),
      appVersion.slice(0, 100),
      new Date().toISOString(),
      new Date().toISOString(),
      license.id,
      machineId,
    )
    .first<{ machine_id: string }>();
  if (!allocated)
    return json(
      {
        status: "seats-exhausted",
        message:
          "Posti esauriti o licenza disattivata. Liberare una postazione prima di attivarla.",
      },
      409,
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

async function handleVerify(env: Env, request: Request): Promise<Response> {
  const body = await readBody(request);
  const key = normalizeLicenseKey(text(body.licenseKey));
  const machineId = text(body.machineId);
  if (!key || !isMachineId(machineId))
    return json(
      { status: "invalid", message: "Richiesta di verifica non valida." },
      400,
    );
  const license = await findLicense(
    env,
    key,
    text(body.productId) || "staiano-hvac",
  );
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
  const license = await findLicense(
    env,
    key,
    text(body.productId) || "staiano-hvac",
  );
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

async function tokenAuthorized(
  expectedToken: string | undefined,
  request: Request,
): Promise<boolean> {
  if (!expectedToken) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(expectedToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const expected = encoder.encode(`Bearer ${expectedToken}`);
  const signature = await crypto.subtle.sign("HMAC", key, expected);
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(request.headers.get("Authorization") ?? ""),
  );
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
      productId: license.product_id,
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
  const session = await passkeySession(env, request);
  if (
    !env.ADMIN_TOKEN &&
    !session &&
    !(await env.DB.prepare("SELECT id FROM admin_passkeys LIMIT 1").first())
  )
    return json(
      { message: "Token amministrativo non configurato sul Worker." },
      503,
    );
  if (!(await tokenAuthorized(env.ADMIN_TOKEN, request)) && !session)
    return json({ message: "Autorizzazione richiesta." }, 401);

  if (pathname === "/admin/products" && request.method === "GET")
    return json({
      products:
        (await env.DB.prepare("SELECT * FROM products ORDER BY name").all())
          .results ?? [],
    });
  if (pathname === "/admin/products" && request.method === "POST") {
    const body = await readBody(request);
    const id = text(body.id),
      name = text(body.name);
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || !name || name.length > 100)
      return json(
        {
          message:
            "Indicare nome e ID software: 2–64 caratteri minuscoli, numeri o trattini.",
        },
        400,
      );
    const existing = await env.DB.prepare(
      "SELECT id FROM products WHERE id = ?",
    )
      .bind(id)
      .first();
    if (existing) return json({ message: "ID software già registrato." }, 409);
    await env.DB.prepare(
      "INSERT INTO products (id, name, created_at) VALUES (?, ?, ?)",
    )
      .bind(id, name, new Date().toISOString())
      .run();
    return json({ status: "created", id }, 201);
  }

  if (pathname === "/admin/releases" && request.method === "GET") {
    const release = await env.DB.prepare(
      "SELECT * FROM releases ORDER BY sequence DESC LIMIT 1",
    ).first<ReleaseRow>();
    return json({ release });
  }

  if (pathname === "/admin/licenses" && request.method === "POST") {
    const body = await readBody(request);
    const customer = text(body.customer);
    const productId = text(body.productId) || "staiano-hvac";
    if (
      !(await env.DB.prepare("SELECT id FROM products WHERE id = ?")
        .bind(productId)
        .first())
    )
      return json(
        { message: "Registrare prima il software della licenza." },
        400,
      );
    if (!customer || customer.length > 200)
      return json({ message: "Indicare il cliente della licenza." }, 400);
    if (body.seats !== undefined && !validSeats(body.seats))
      return json(
        { message: "Postazioni: indicare un intero fra 1 e 1000." },
        400,
      );
    if (
      text(body.notes).length > 2000 ||
      text(body.plan).length > 100 ||
      text(body.features).length > 500
    )
      return json(
        { message: "Piano, funzionalità o note troppo lunghi." },
        400,
      );
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const key = formatLicenseKey(generateLicenseKey(random));
    const license: LicenseRow = {
      id: `lic_${crypto.randomUUID().replaceAll("-", "")}`,
      product_id: productId,
      customer,
      plan: text(body.plan) || "standard",
      seats: body.seats === undefined ? 1 : (body.seats as number),
      status: "active",
      features:
        text(body.features) ||
        (productId === "staiano-hvac" ? "configurator" : "standard"),
      notes: text(body.notes) || null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    await env.DB.prepare(
      "INSERT INTO licenses (id, key_hash, customer, plan, seats, status, features, notes, created_at, revoked_at, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
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
        productId,
      )
      .run();
    return json({ status: "created", key, license }, 201);
  }

  if (pathname === "/admin/licenses" && request.method === "GET")
    return listLicenses(env);

  const edit = pathname.match(/^\/admin\/licenses\/([A-Za-z0-9_]+)$/);
  if (edit && request.method === "PATCH") {
    const body = await readBody(request);
    const customer = text(body.customer),
      plan = text(body.plan),
      features = text(body.features),
      notes = text(body.notes);
    if (
      !customer ||
      customer.length > 200 ||
      !plan ||
      plan.length > 100 ||
      !features ||
      features.length > 500 ||
      notes.length > 2000 ||
      !validSeats(body.seats)
    )
      return json(
        {
          message:
            "Controllare cliente, piano, funzionalità e numero di postazioni (1–1000).",
        },
        400,
      );
    const changed = await env.DB.prepare(
      `UPDATE licenses SET customer = ?, plan = ?, seats = ?, features = ?, notes = ?
      WHERE id = ? AND ? >= (SELECT COUNT(*) FROM activations WHERE license_id = licenses.id AND released_at IS NULL) RETURNING id`,
    )
      .bind(
        customer,
        plan,
        body.seats,
        features,
        notes || null,
        edit[1],
        body.seats,
      )
      .first<{ id: string }>();
    return changed
      ? json({ status: "updated", id: changed.id })
      : json(
          {
            message:
              "Licenza inesistente o postazioni inferiori a quelle attive. Liberare prima i posti occupati.",
          },
          409,
        );
  }

  const action = pathname.match(
    /^\/admin\/licenses\/([A-Za-z0-9_]+)\/(revoke|restore|release|rotate)$/,
  );
  if (action && request.method === "POST") {
    const [, id, operation] = action;
    const license = await env.DB.prepare("SELECT * FROM licenses WHERE id = ?")
      .bind(id)
      .first<LicenseRow>();
    if (!license) return json({ message: "Licenza inesistente." }, 404);
    if (operation === "rotate") {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const key = formatLicenseKey(generateLicenseKey(random));
      await env.DB.prepare("UPDATE licenses SET key_hash = ? WHERE id = ?")
        .bind(await hashLicenseKey(key), id)
        .run();
      return json({ status: "rotated", id, key });
    }
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

type ReleaseRow = {
  sequence: number;
  commit_sha: string;
  sha256: string;
  size: number;
  url: string;
  created_at: string;
};

async function publishRelease(env: Env, request: Request): Promise<Response> {
  if (!(await tokenAuthorized(env.PUBLISH_TOKEN, request)))
    return json({ message: "Autorizzazione richiesta." }, 401);
  const body = await readBody(request);
  const commit = text(body.commit),
    sha256 = text(body.sha256),
    url = text(body.url);
  if (
    !/^[a-f0-9]{40}$/.test(commit) ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !/^https:\/\/codeberg\.org\/AvocadoOra\/Staiano-3D\/releases\/download\/[A-Za-z0-9._-]+\/StaianoHVAC\.exe$/.test(
      url,
    ) ||
    typeof body.size !== "number" ||
    !Number.isSafeInteger(body.size) ||
    body.size < 1 ||
    body.size > 536_870_912
  )
    return json({ message: "Pacchetto di aggiornamento non valido." }, 400);
  if (!env.CODEBERG_READ_TOKEN)
    return json({ message: "Accesso alle build non configurato." }, 503);
  const head = await fetch(
    "https://codeberg.org/api/v1/repos/AvocadoOra/Staiano-3D/branches/main",
    {
      headers: { Authorization: `token ${env.CODEBERG_READ_TOKEN}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!head.ok) return json({ message: "Codeberg non raggiungibile." }, 503);
  const branch = (await head.json()) as { commit?: { id?: string } };
  if (branch.commit?.id !== commit)
    return json(
      { message: "La build non corrisponde alla revisione corrente di main." },
      409,
    );
  await env.DB.prepare(
    "INSERT INTO releases (commit_sha, sha256, size, url, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(commit_sha) DO NOTHING",
  )
    .bind(commit, sha256, body.size, url, new Date().toISOString())
    .run();
  return json({ status: "published", commit });
}

async function handleUpdate(env: Env, request: Request): Promise<Response> {
  const body = await readBody(request);
  const key = normalizeLicenseKey(text(body.licenseKey)),
    machineId = text(body.machineId),
    nonce = text(body.nonce);
  if (!key || !isMachineId(machineId) || !/^[a-f0-9]{64}$/.test(nonce))
    return json({ message: "Richiesta di aggiornamento non valida." }, 400);
  const license = await findLicense(env, key);
  const seat = license ? await activation(env, license.id, machineId) : null;
  if (
    !license ||
    license.status !== "active" ||
    !seat ||
    seat.released_at ||
    !license.features
      .split(",")
      .map((x) => x.trim())
      .includes("configurator")
  )
    return json(
      {
        message: "Aggiornamento riservato alle postazioni con licenza attiva.",
      },
      403,
    );
  const release = await env.DB.prepare(
    "SELECT * FROM releases ORDER BY sequence DESC LIMIT 1",
  ).first<ReleaseRow>();
  if (!release) return json({ status: "current", release: null });
  if (new URL(request.url).pathname === "/updates/download") {
    if (body.sequence !== release.sequence)
      return json({ message: "Pacchetto non più corrente." }, 409);
    if (!env.CODEBERG_READ_TOKEN)
      return json({ message: "Download non configurato." }, 503);
    let url = release.url;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (new URL(url).origin !== "https://codeberg.org")
        return json({ message: "Destinazione download non consentita." }, 502);
      const upstream = await fetch(url, {
        headers: { Authorization: `token ${env.CODEBERG_READ_TOKEN}` },
        redirect: "manual",
        signal: AbortSignal.timeout(300_000),
      });
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const location = upstream.headers.get("Location");
        await upstream.body?.cancel();
        if (!location) break;
        url = new URL(location, url).href;
        continue;
      }
      if (!upstream.ok)
        return json({ message: "Pacchetto non disponibile." }, 502);
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename=StaianoHVAC.exe",
        },
      });
    }
    return json({ message: "Download non riuscito." }, 502);
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    app: "staiano-hvac",
    platform: "win32-x64",
    sequence: release.sequence,
    commit: release.commit_sha,
    sha256: release.sha256,
    size: release.size,
    url: "https://licenses.ivanbuonocore.dev/updates/download",
    machineId,
    nonce,
    issuedAt: now,
    expiresAt: now + 300,
  };
  const encoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.LICENSE_PRIVATE_KEY!),
    "Ed25519",
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "Ed25519",
    signingKey,
    new TextEncoder().encode(`staiano-update-v1.${encoded}`),
  );
  return json({
    status: "available",
    manifest: `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`,
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  try {
    if (
      [
        "/",
        "/admin",
        "/admin/",
        "/admin.js",
        "/admin.css",
        "/webauthn.js",
      ].includes(pathname) &&
      request.method === "GET" &&
      env.ASSETS
    ) {
      const url = new URL(request.url);
      if (!["/admin.js", "/admin.css", "/webauthn.js"].includes(pathname))
        url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (pathname === "/health") return json({ ok: true, service: "licenses" });
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ message: "Origine non consentita." }, 403);
    if (
      env.API_LIMITER &&
      !(
        await env.API_LIMITER.limit({
          key: `${pathname.startsWith("/admin/") ? "admin" : "api"}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
        })
      ).success
    )
      return json(
        { message: "Troppe richieste. Riprovare fra un minuto." },
        429,
      );
    if (pathname === "/publish" && request.method === "POST")
      return await publishRelease(env, request);
    if (pathname === "/publish/status" && request.method === "GET") {
      if (!(await tokenAuthorized(env.PUBLISH_TOKEN, request)))
        return json({ message: "Autorizzazione richiesta." }, 401);
      const release = await env.DB.prepare(
        "SELECT commit_sha FROM releases ORDER BY sequence DESC LIMIT 1",
      ).first<{ commit_sha: string }>();
      return json({ commit: release?.commit_sha ?? null });
    }
    if (
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/admin/passkeys/")
    )
      return await handlePasskeys(
        request,
        env,
        await readBody(request),
        (await tokenAuthorized(env.ADMIN_TOKEN, request)) ||
          (await passkeySession(env, request)),
      );
    if (pathname.startsWith("/admin/"))
      return await handleAdmin(env, request, pathname);
    if (
      ![
        "/activate",
        "/verify",
        "/deactivate",
        "/updates/check",
        "/updates/download",
      ].includes(pathname)
    )
      return json({ message: "Endpoint non riconosciuto." }, 404);
    if (!env.LICENSE_PRIVATE_KEY)
      return json(
        { message: "Chiave di firma non configurata sul Worker." },
        503,
      );
    if (request.method !== "POST")
      return json({ message: "Metodo non consentito." }, 405);
    if (pathname === "/updates/check" || pathname === "/updates/download")
      return await handleUpdate(env, request);
    if (pathname === "/activate") return await handleActivate(env, request);
    if (pathname === "/verify") return await handleVerify(env, request);
    return await handleDeactivate(env, request);
  } catch (error) {
    if (error instanceof Response)
      return json({ message: "Richiesta troppo grande." }, error.status);
    return json(
      { message: "Errore del server licenze. Riprovare più tardi." },
      500,
    );
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env);
    const secured = new Response(response.body, response);
    secured.headers.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    secured.headers.set("Cache-Control", "no-store");
    return secured;
  },
};

export default worker;
