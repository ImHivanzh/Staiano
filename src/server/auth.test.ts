import { randomBytes, scryptSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  AccessConfig,
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
    const html = await readyPage.text();
    expect(html).toContain('action="/api/auth/login"');
    expect(html).toContain('type="password"');
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
