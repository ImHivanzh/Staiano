import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  AccessConfig,
  authenticateUser,
  changeUserPassword,
  getSessionUser,
  manageUser,
  cookieOptions,
  createSession,
  getAccessConfig,
  isSameOrigin,
  safeReturnPath,
  SESSION_COOKIE,
  SESSION_SECONDS,
  takeLoginAttempt,
  verifyPassword,
  verifySession,
} from "./auth";
import { proxy } from "../proxy";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { GET as loginPage } from "../app/accedi/route";
import { POST as changePassword } from "../app/api/auth/change-password/route";
import { GET as currentSession } from "../app/api/auth/session/route";
import {
  GET as listUsers,
  POST as manageUsers,
} from "../app/api/admin/users/route";

const directories: string[] = [];

function config(password = "Auth-test-only-password") {
  const salt = randomBytes(32);
  return {
    version: 1,
    salt: salt.toString("hex"),
    passwordHash: scryptSync(password, salt, 64).toString("hex"),
    sessionSecret: randomBytes(32).toString("hex"),
  } satisfies AccessConfig;
}

async function configure(value = config()) {
  const directory = await mkdtemp(join(tmpdir(), "staiano-auth-test-"));
  directories.push(directory);
  const file = join(directory, "auth.json");
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  vi.stubEnv("AUTH_FILE", file);
  return value;
}

function request(path: string, options: RequestInit = {}) {
  return new NextRequest(`https://hvac.example${path}`, {
    ...options,
    signal: options.signal ?? undefined,
    headers: {
      host: "hvac.example",
      ...Object.fromEntries(new Headers(options.headers)),
    },
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("gestione utenti dal profilo admin", () => {
  const post = (
    cookie: string,
    fields: Record<string, string>,
    origin = "https://hvac.example",
  ) =>
    manageUsers(
      request("/api/admin/users", {
        method: "POST",
        headers: {
          origin,
          cookie,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields),
      }),
    );
  const createFields = (username = "nuovo.utente") => ({
    action: "create",
    username,
    displayName: "Nuovo utente",
    password: "  Operator-test-password-2026  ",
    confirmPassword: "  Operator-test-password-2026  ",
  });
  it("crea un operatore, conserva il vecchio admin e rinnova la sessione legacy senza esporre segreti", async () => {
    const initial = await configure();
    const cookie = `${SESSION_COOKIE}=${createSession(initial)}`;
    const result = await post(cookie, createFields("Nuovo.Utente"));
    expect(result.status).toBe(201);
    const body = await result.json();
    expect(body.user).toMatchObject({
      username: "nuovo.utente",
      role: "operator",
      mustChangePassword: true,
    });
    const updated = await getAccessConfig();
    expect(updated.users).toHaveLength(2);
    expect(
      await authenticateUser("admin", "Auth-test-only-password", updated),
    ).toMatchObject({ role: "admin" });
    expect(
      await authenticateUser("nuovo.utente", createFields().password, updated),
    ).toMatchObject({ mustChangePassword: true });
    for (const secret of [
      initial.sessionSecret,
      initial.passwordHash,
      createFields().password,
      ...updated.users!.flatMap((u) => [u.salt, u.passwordHash]),
    ])
      expect(JSON.stringify(body)).not.toContain(secret);
    const renewed = result.headers.get("set-cookie")!;
    expect(renewed).toContain("HttpOnly");
    expect(renewed).toContain("SameSite=strict");
    expect(renewed).toContain("Secure");
    const adminCookie = renewed.split(";")[0];
    expect(
      (
        await listUsers(
          request("/api/admin/users", { headers: { cookie: adminCookie } }),
        )
      ).status,
    ).toBe(200);
    const duplicate = await post(adminCookie, createFields("NUOVO.UTENTE"));
    expect(duplicate.status).toBe(409);
    const before = await readFile(process.env.AUTH_FILE!, "utf8");
    expect(
      (await post(adminCookie, { ...createFields("bad/name") })).status,
    ).toBe(400);
    expect(
      (
        await post(adminCookie, {
          ...createFields("altro"),
          confirmPassword: "different-password",
        })
      ).status,
    ).toBe(400);
    expect(await readFile(process.env.AUTH_FILE!, "utf8")).toBe(before);
  });
  it("nega accesso agli operatori, richieste cross-origin e corpi troppo grandi", async () => {
    const initial = await configure(),
      admin = getSessionUser(createSession(initial), initial)!;
    const operator = await manageUser(
      admin,
      "create",
      createFields("operatore"),
    );
    const updated = await getAccessConfig();
    const adminCookie = `${SESSION_COOKIE}=${createSession(updated)}`;
    const operatorCookie = `${SESSION_COOKIE}=${createSession(updated, Date.now(), operator)}`;
    const before = await readFile(process.env.AUTH_FILE!, "utf8");
    expect((await listUsers(request("/api/admin/users"))).status).toBe(401);
    expect(
      (
        await listUsers(
          request("/api/admin/users", { headers: { cookie: operatorCookie } }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await post(operatorCookie, createFields("nonpermesso"))).status,
    ).toBe(403);
    expect(
      (await post(adminCookie, createFields("origine"), "https://evil.example"))
        .status,
    ).toBe(403);
    expect(
      (
        await post(adminCookie, {
          ...createFields("grande"),
          displayName: "x".repeat(5000),
        })
      ).status,
    ).toBe(400);
    expect(await readFile(process.env.AUTH_FILE!, "utf8")).toBe(before);
  });
  it("resetta solo la password richiesta, revoca vecchie sessioni e serializza scritture simultanee", async () => {
    const initial = await configure(),
      admin = getSessionUser(createSession(initial), initial)!;
    const [first, second] = await Promise.all([
      manageUser(admin, "create", createFields("primo")),
      manageUser(admin, "create", createFields("secondo")),
    ]);
    let current = await getAccessConfig();
    expect(current.users).toHaveLength(3);
    const firstToken = createSession(current, Date.now(), first),
      secondToken = createSession(current, Date.now(), second),
      adminToken = createSession(current);
    const reset = await post(`${SESSION_COOKIE}=${adminToken}`, {
      action: "reset",
      username: "primo",
      password: "Reset-test-password-2026",
      confirmPassword: "Reset-test-password-2026",
    });
    expect(reset.status).toBe(200);
    current = await getAccessConfig();
    expect(verifySession(firstToken, current)).toBe(false);
    expect(verifySession(secondToken, current)).toBe(true);
    expect(verifySession(adminToken, current)).toBe(true);
    expect(
      await authenticateUser("primo", createFields().password, current),
    ).toBeNull();
    expect(
      await authenticateUser("primo", "Reset-test-password-2026", current),
    ).toMatchObject({ mustChangePassword: true });
    const before = await readFile(process.env.AUTH_FILE!, "utf8");
    expect(
      (
        await post(`${SESSION_COOKIE}=${adminToken}`, {
          action: "reset",
          username: "admin",
          password: "Self-reset-password-2026",
          confirmPassword: "Self-reset-password-2026",
        })
      ).status,
    ).toBe(400);
    await expect(
      manageUser({ ...admin, revision: 99 }, "create", createFields("scaduto")),
    ).rejects.toThrow("amministratore attivo");
    expect(await readFile(process.env.AUTH_FILE!, "utf8")).toBe(before);
  });
});

describe("password and sessions", () => {
  it("configures from stdin privately, preserves spaces, is idempotent and rotates sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staiano-access-cli-test-"));
    directories.push(directory);
    const file = join(directory, "auth.json");
    const invoke = (args: string[], input: string) =>
      spawnSync(process.execPath, ["scripts/configure-access.mjs", ...args], {
        env: { ...process.env, AUTH_FILE: file },
        input,
        encoding: "utf8",
        windowsHide: true,
      });
    const password = "  test-only password with spaces  ";
    const created = invoke(["--stdin"], `${password}\r\n`);
    expect(created.status).toBe(0);
    expect(created.stdout).not.toContain(password);
    vi.stubEnv("AUTH_FILE", file);
    const initial = await getAccessConfig();
    expect(await verifyPassword(password, initial)).toBe(true);
    const token = createSession(initial);
    expect(invoke(["--stdin"], "ignored-test-password\n").status).toBe(0);
    expect(await getAccessConfig()).toEqual(initial);
    expect(invoke(["--rotate-session-only"], "").status).toBe(0);
    const sessionRotated = await getAccessConfig();
    expect(sessionRotated.salt).toBe(initial.salt);
    expect(sessionRotated.passwordHash).toBe(initial.passwordHash);
    expect(sessionRotated.sessionSecret).not.toBe(initial.sessionSecret);
    expect(await verifyPassword(password, sessionRotated)).toBe(true);
    expect(verifySession(token, sessionRotated)).toBe(false);
    expect(
      invoke(["--stdin", "--rotate"], "replacement-test-only-password\n")
        .status,
    ).toBe(0);
    const updated = await getAccessConfig();
    expect(
      await verifyPassword("replacement-test-only-password", updated),
    ).toBe(true);
    expect(verifySession(token, updated)).toBe(false);
  });

  it("checks password with scrypt and rejects incorrect or excessive input", async () => {
    const value = config();
    expect(await verifyPassword("Auth-test-only-password", value)).toBe(true);
    expect(await verifyPassword("incorrect", value)).toBe(false);
    expect(await verifyPassword("x".repeat(1025), value)).toBe(false);
  });

  it("rejects forgery, expiry and sessions from the previous password configuration", () => {
    const value = config();
    const now = Date.now();
    const session = createSession(value, now);
    expect(verifySession(session, value, now)).toBe(true);
    expect(verifySession(`${session.slice(0, -2)}XX`, value, now)).toBe(false);
    expect(verifySession(session, value, now + SESSION_SECONDS * 1000)).toBe(
      false,
    );
    expect(verifySession(session, config(), now)).toBe(false);
    expect(verifySession("../../invalid", value)).toBe(false);
  });

  it("loads private credentials and fails closed for absent or malformed files", async () => {
    const value = await configure();
    expect(await getAccessConfig()).toEqual(value);
    const file = process.env.AUTH_FILE!;
    await writeFile(file, "{}");
    await expect(getAccessConfig()).rejects.toThrow("Accesso non configurato");
    vi.stubEnv(
      "AUTH_FILE",
      join(tmpdir(), `missing-${randomBytes(8).toString("hex")}.json`),
    );
    await expect(getAccessConfig()).rejects.toThrow("Accesso non configurato");
  });
});

describe("request security", () => {
  it("checks public HTTPS origin against the Host preserved by Caddy", () => {
    const forwarded = request("/api/auth/login", {
      headers: {
        origin: "https://hvac.example",
        "x-forwarded-host": "hvac.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(isSameOrigin(forwarded)).toBe(true);
    expect(cookieOptions(forwarded)).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "strict",
    });
    expect(
      isSameOrigin(
        request("/", { headers: { origin: "https://evil.example" } }),
      ),
    ).toBe(false);
    expect(isSameOrigin(request("/"))).toBe(false);
    expect(
      isSameOrigin(
        request("/", {
          headers: {
            origin: "https://evil.example",
            "x-forwarded-host": "evil.example",
          },
        }),
      ),
    ).toBe(false);
  });

  it("allows local HTTP without dropping same-origin validation", () => {
    const local = new Request("http://localhost:3015/api/auth/login", {
      headers: { host: "localhost:3015", origin: "http://localhost:3015" },
    });
    expect(isSameOrigin(local)).toBe(true);
    expect(cookieOptions(local).secure).toBe(false);
  });

  it("keeps return destinations on this application", () => {
    expect(safeReturnPath("/progetto?tab=3d")).toBe("/progetto?tab=3d");
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/accedi",
      "/api/auth/logout",
      "/\r\nLocation: evil",
    ])
      expect(safeReturnPath(value)).toBe("/");
  });

  it("limits simultaneous failure attempts before performing scrypt", () => {
    const value = request("/api/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.52" },
    });
    const now = Date.now() + 86400000;
    for (let attempt = 0; attempt < 5; attempt++)
      expect(takeLoginAttempt(value, now)).toBe(0);
    expect(takeLoginAttempt(value, now)).toBe(900);
    expect(takeLoginAttempt(value, now + 900000)).toBe(0);
  });
});

describe("protected app", () => {
  it("covers homepage, API, static models, workers and Next chunks", async () => {
    const value = await configure();
    for (const path of [
      "/",
      "/models3d/model.glb",
      "/workers/pdf.worker.min.mjs",
      "/_next/static/chunks/app.js",
    ]) {
      const response = await proxy(request(path));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        `https://hvac.example/accedi?next=${encodeURIComponent(path)}`,
      );
    }
    expect((await proxy(request("/api/import/dwg"))).status).toBe(401);
    expect(
      (await proxy(request("/api/import/dwg", { method: "POST" }))).status,
    ).toBe(401);
    for (const path of ["/", "/models3d/model.glb", "/api/import/dwg"]) {
      const response = await proxy(
        request(path, {
          headers: { cookie: `${SESSION_COOKIE}=${createSession(value)}` },
        }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("serves self-contained login and exposes no protected resources without config", async () => {
    vi.stubEnv(
      "AUTH_FILE",
      join(tmpdir(), `missing-${randomBytes(8).toString("hex")}.json`),
    );
    expect((await proxy(request("/"))).status).toBe(503);
    const page = await loginPage(request("/accedi"));
    expect(page.status).toBe(503);
    expect(await page.text()).toContain("Accesso non configurato");
    await configure();
    const readyPage = await loginPage(request("/accedi"));
    expect(readyPage.headers.get("referrer-policy")).toBe("same-origin");
    const html = await readyPage.text();
    expect(html).toContain('action="/api/auth/login"');
    expect(html).toContain('type="password"');
    expect(html).toContain('<select id="username" name="username" required');
    expect(html).toContain(
      '<option value="" selected disabled>Seleziona utente</option>',
    );
    expect(html).toContain('<option value="admin">Ivan</option>');
    expect(html).not.toContain("<script");
  });

  it("sets private HTTPS session on successful form login and removes it on logout", async () => {
    await configure();
    const result = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://hvac.example",
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.76",
        },
        body: new URLSearchParams({
          password: "Auth-test-only-password",
          next: "/",
        }),
      }),
    );
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/");
    const cookie = result.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Max-Age=28800");
    const cleared = await logout(
      request("/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://hvac.example",
          cookie: cookie.split(";")[0],
        },
      }),
    );
    expect(cleared.status).toBe(303);
    expect(cleared.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects cross-origin login, wrong password and oversized streamed form", async () => {
    await configure();
    expect(
      (
        await login(
          request("/api/auth/login", {
            method: "POST",
            headers: { origin: "https://evil.example" },
          }),
        )
      ).status,
    ).toBe(403);
    const failed = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://hvac.example",
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.99",
        },
        body: "password=wrong",
      }),
    );
    expect(failed.headers.get("location")).toContain("error=invalid");
    expect(failed.headers.get("set-cookie")).toBeNull();
    const large = await login(
      request("/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://hvac.example",
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.99",
        },
        body: "password=" + "x".repeat(5000),
      }),
    );
    expect(large.status).toBe(400);
  });
});

describe("named users", () => {
  it("bootstraps all four accounts from empty configuration without exposing passwords", async () => {
    const directory = await mkdtemp(join(tmpdir(), "staiano-users-new-test-"));
    directories.push(directory);
    const file = join(directory, "auth.json");
    vi.stubEnv("AUTH_FILE", file);
    const result = spawnSync(
      process.execPath,
      ["scripts/manage-accounts.mjs", "--bootstrap"],
      {
        env: { ...process.env, AUTH_FILE: file },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    expect(result.status).toBe(0);
    const value = await getAccessConfig();
    const credentials = JSON.parse(
      await readFile(join(directory, "initial-user-credentials.json"), "utf8"),
    );
    expect(value.users).toHaveLength(4);
    expect(credentials.accounts).toHaveLength(4);
    for (const account of credentials.accounts) {
      expect(result.stdout + result.stderr).not.toContain(account.password);
      const user = await authenticateUser(
        account.username,
        account.password,
        value,
      );
      expect(user).toMatchObject({
        username: account.username,
        mustChangePassword: true,
      });
      const token = createSession(value, Date.now(), user!);
      expect(verifySession(token, value)).toBe(true);
      expect(
        verifySession(token, value, Date.now() + SESSION_SECONDS * 1000),
      ).toBe(false);
      const parts = token.split(".");
      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      claims.sub = "admin";
      claims.role = "admin";
      claims.rev = 999;
      parts[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
      expect(verifySession(parts.join("."), value)).toBe(false);
    }
  });

  async function bootstrap() {
    const initial = await configure();
    const invoke = (...args: string[]) =>
      spawnSync(process.execPath, ["scripts/manage-accounts.mjs", ...args], {
        env: { ...process.env, AUTH_FILE: process.env.AUTH_FILE! },
        encoding: "utf8",
        windowsHide: true,
      });
    expect(invoke("--bootstrap").status).toBe(0);
    const config = await getAccessConfig();
    const credentials = JSON.parse(
      await readFile(
        join(process.env.AUTH_FILE!, "..", "initial-user-credentials.json"),
        "utf8",
      ),
    ) as { accounts: { username: string; password: string }[] };
    return { initial, config, credentials, invoke };
  }

  it("creates three distinct operators, preserves the admin password and is idempotent", async () => {
    const { initial, config, credentials, invoke } = await bootstrap();
    expect(config.users?.map((user) => user.username)).toEqual([
      "admin",
      "samuele",
      "gionathan",
      "marco",
    ]);
    expect(config.passwordHash).toBe(initial.passwordHash);
    expect(config.sessionSecret).toBe(initial.sessionSecret);
    expect(credentials.accounts).toHaveLength(3);
    expect(
      new Set(credentials.accounts.map((user) => user.password)).size,
    ).toBe(3);
    for (const account of credentials.accounts) {
      expect(
        await authenticateUser(account.username, account.password, config),
      ).toMatchObject({
        username: account.username,
        role: "operator",
        mustChangePassword: true,
      });
      expect(
        await authenticateUser("admin", account.password, config),
      ).toBeNull();
    }
    expect(
      await authenticateUser(" ADMIN ", "Auth-test-only-password", config),
    ).toMatchObject({ role: "admin", displayName: "Ivan" });
    expect(
      await authenticateUser("", "Auth-test-only-password", config),
    ).toBeNull();
    expect(verifySession(createSession(initial), config)).toBe(false);
    const repeat = invoke("--bootstrap");
    expect(repeat.status).toBe(0);
    expect(await getAccessConfig()).toEqual(config);
    for (const account of credentials.accounts)
      expect(repeat.stdout).not.toContain(account.password);
  });

  it("lists only active users, escapes labels and shows Ivan for existing admin accounts", async () => {
    const { config } = await bootstrap();
    config.users!.find((user) => user.username === "admin")!.displayName =
      "Admin";
    config.users!.find((user) => user.username === "marco")!.disabled = true;
    config.users!.find((user) => user.username === "samuele")!.displayName =
      '<Samuele & "team">';
    await writeFile(process.env.AUTH_FILE!, JSON.stringify(config));
    const page = await loginPage(request("/accedi"));
    const html = await page.text();
    expect(html).toContain('<option value="admin">Ivan</option>');
    expect(html).toContain(
      '<option value="samuele">&lt;Samuele &amp; &quot;team&quot;&gt;</option>',
    );
    expect(html).toContain('<option value="gionathan">Gionathan</option>');
    expect(html).not.toContain('<option value="marco">');
    expect(html).not.toContain('type="text"');
    const identity = await authenticateUser(
      "admin",
      "Auth-test-only-password",
      config,
    );
    expect(identity).toMatchObject({ username: "admin", displayName: "Ivan" });
    const session = createSession(config, Date.now(), identity!);
    expect(getSessionUser(session, config)).toMatchObject({
      displayName: "Ivan",
    });
    expect(html).not.toContain(config.sessionSecret);
    for (const user of config.users!) {
      expect(html).not.toContain(user.salt);
      expect(html).not.toContain(user.passwordHash);
    }
  });

  it("requires first-login password change, rejects wrong current password, renews identity and revokes old sessions", async () => {
    const { config, credentials } = await bootstrap();
    const account = credentials.accounts.find(
      (entry) => entry.username === "samuele",
    )!;
    const headers = {
      origin: "https://hvac.example",
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "203.0.113.101",
    };
    const loggedIn = await login(
      request("/api/auth/login", {
        method: "POST",
        headers,
        body: new URLSearchParams({
          username: "Samuele",
          password: account.password,
          next: "/",
        }),
      }),
    );
    expect(loggedIn.headers.get("location")).toContain("password=change");
    const cookie = loggedIn.headers.get("set-cookie")!.split(";")[0];
    const token = cookie.slice(cookie.indexOf("=") + 1);
    expect(getSessionUser(token, config)).toMatchObject({
      username: "samuele",
      role: "operator",
    });
    expect(
      (await proxy(request("/", { headers: { cookie } }))).headers.get(
        "location",
      ),
    ).toContain("password=change");
    expect(
      (await proxy(request("/api/import/dwg", { headers: { cookie } }))).status,
    ).toBe(403);
    const page = await loginPage(request("/accedi", { headers: { cookie } }));
    expect(await page.text()).toContain('action="/api/auth/change-password"');
    const newPassword = "Personal-test-password-2026";
    const change = (currentPassword: string, origin = "https://hvac.example") =>
      changePassword(
        request("/api/auth/change-password", {
          method: "POST",
          headers: { ...headers, origin, cookie },
          body: new URLSearchParams({
            currentPassword,
            password: newPassword,
            confirmPassword: newPassword,
            next: "/",
          }),
        }),
      );
    expect(
      (await change(account.password, "https://evil.example")).status,
    ).toBe(403);
    expect((await change("wrong-password")).headers.get("location")).toContain(
      "error=password",
    );
    const changed = await change(account.password);
    expect(changed.headers.get("location")).toBe("/");
    const updated = await getAccessConfig();
    expect(verifySession(token, updated)).toBe(false);
    expect(
      await authenticateUser("samuele", account.password, updated),
    ).toBeNull();
    expect(
      await authenticateUser("samuele", newPassword, updated),
    ).toMatchObject({ mustChangePassword: false });
    const newCookie = changed.headers.get("set-cookie")!.split(";")[0];
    const identity = await currentSession(
      request("/api/auth/session", { headers: { cookie: newCookie } }),
    );
    expect(await identity.json()).toEqual({
      username: "samuele",
      displayName: "Samuele",
      role: "operator",
      mustChangePassword: false,
    });
    expect(
      (
        await proxy(request("/", { headers: { cookie: newCookie } }))
      ).headers.get("x-middleware-next"),
    ).toBe("1");
    await expect(
      changeUserPassword(
        getSessionUser(token, config)!,
        "Another-password-2026",
      ),
    ).rejects.toThrow("Sessione scaduta");
  });

  it("disables and resets individual users without revoking other identities and refuses the last-admin disable", async () => {
    const { config, credentials, invoke } = await bootstrap();
    const marco = credentials.accounts.find(
      (entry) => entry.username === "marco",
    )!;
    const identity = await authenticateUser("marco", marco.password, config);
    const token = createSession(config, Date.now(), identity!);
    const admin = createSession(config);
    expect(invoke("--disable", "marco").status).toBe(0);
    let updated = await getAccessConfig();
    expect(verifySession(token, updated)).toBe(false);
    expect(verifySession(admin, updated)).toBe(true);
    expect(await authenticateUser("marco", marco.password, updated)).toBeNull();
    expect(invoke("--enable", "marco").status).toBe(0);
    updated = await getAccessConfig();
    expect(verifySession(token, updated)).toBe(false);
    expect(invoke("--disable", "admin").status).toBe(1);
    expect(invoke("--reset", "marco").status).toBe(0);
    updated = await getAccessConfig();
    expect(await authenticateUser("marco", marco.password, updated)).toBeNull();
    expect(verifySession(admin, updated)).toBe(true);
  });

  it("admin password and session rotations preserve operator credentials", async () => {
    const { config, credentials } = await bootstrap();
    const adminToken = createSession(config);
    const rotate = (args: string[], input = "") =>
      spawnSync(process.execPath, ["scripts/configure-access.mjs", ...args], {
        env: { ...process.env, AUTH_FILE: process.env.AUTH_FILE! },
        input,
        encoding: "utf8",
        windowsHide: true,
      });
    expect(rotate(["--rotate-session-only"]).status).toBe(0);
    let updated = await getAccessConfig();
    expect(updated.users).toEqual(config.users);
    expect(verifySession(adminToken, updated)).toBe(false);
    expect(
      rotate(["--stdin", "--rotate"], "Rotated-admin-test-password\n").status,
    ).toBe(0);
    updated = await getAccessConfig();
    expect(
      await authenticateUser("admin", "Rotated-admin-test-password", updated),
    ).toMatchObject({ role: "admin", mustChangePassword: false });
    expect(
      await authenticateUser("admin", "Auth-test-only-password", updated),
    ).toBeNull();
    for (const account of credentials.accounts)
      expect(
        await authenticateUser(account.username, account.password, updated),
      ).toMatchObject({ role: "operator" });
  });
});
