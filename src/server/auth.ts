import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const SESSION_COOKIE = "staiano_session";
export const SESSION_SECONDS = 8 * 60 * 60;

export interface AccessConfig {
  version: 1;
  salt: string;
  passwordHash: string;
  sessionSecret: string;
}

export class AccessConfigurationError extends Error {
  constructor() {
    super(
      "Accesso non configurato. Eseguire node scripts/configure-access.mjs sul server.",
    );
  }
}

let cached:
  | { path: string; modified: number; size: number; config: AccessConfig }
  | undefined;

export async function getAccessConfig(): Promise<AccessConfig> {
  const file = resolve(
    /* turbopackIgnore: true */
    process.env.AUTH_FILE ||
      resolve(
        /* turbopackIgnore: true */ process.cwd(),
        ".cache/app-auth.json",
      ),
  );
  try {
    // Credentials are runtime-private files, never build/deployment dependencies.
    const info = await stat(/* turbopackIgnore: true */ file);
    if (
      cached?.path === file &&
      cached.modified === info.mtimeMs &&
      cached.size === info.size
    ) {
      return cached.config;
    }
    const config = JSON.parse(
      await readFile(/* turbopackIgnore: true */ file, "utf8"),
    ) as AccessConfig;
    if (
      config.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(config.salt) ||
      !/^[a-f0-9]{128}$/.test(config.passwordHash) ||
      !/^[a-f0-9]{64}$/.test(config.sessionSecret)
    ) {
      throw new AccessConfigurationError();
    }
    cached = { path: file, modified: info.mtimeMs, size: info.size, config };
    return config;
  } catch {
    cached = undefined;
    throw new AccessConfigurationError();
  }
}

export async function verifyPassword(
  password: string,
  config: AccessConfig,
): Promise<boolean> {
  if (!password || Buffer.byteLength(password, "utf8") > 1024) return false;
  const derived = await new Promise<Buffer>((accept, reject) => {
    scrypt(
      password,
      Buffer.from(config.salt, "hex"),
      64,
      { N: 16384, r: 8, p: 1 },
      (error, key) => {
        if (error) reject(error);
        else accept(key);
      },
    );
  });
  return timingSafeEqual(derived, Buffer.from(config.passwordHash, "hex"));
}

export function createSession(config: AccessConfig, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("base64url")}`;
  const signature = createHmac(
    "sha256",
    Buffer.from(config.sessionSecret, "hex"),
  )
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(
  value: string | undefined,
  config: AccessConfig,
  now = Date.now(),
): boolean {
  if (!value || value.length > 160) return false;
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    !/^\d{10}$/.test(parts[0]) ||
    !/^[\w-]{32}$/.test(parts[1]) ||
    !/^[\w-]{43}$/.test(parts[2])
  )
    return false;
  const expires = Number(parts[0]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + SESSION_SECONDS) return false;
  const expected = createHmac(
    "sha256",
    Buffer.from(config.sessionSecret, "hex"),
  )
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const signature = Buffer.from(parts[2], "base64url");
  return (
    signature.length === expected.length && timingSafeEqual(signature, expected)
  );
}

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "http://local.invalid");
    if (
      url.origin !== "http://local.invalid" ||
      url.pathname === "/accedi" ||
      url.pathname.startsWith("/api/auth/")
    )
      return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

export function requestOrigin(request: Request): string | null {
  const host = request.headers.get("host") || new URL(request.url).host;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && forwardedHost !== host) return null;
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol || new URL(request.url).protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") return null;
  try {
    const parsed = new URL(`${protocol}://${host}`);
    if (
      parsed.host !== host ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/"
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(request: Request): boolean {
  const expected = requestOrigin(request);
  const origin = request.headers.get("origin");
  return expected !== null && origin !== null && origin === expected;
}

export function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    secure: requestOrigin(request)?.startsWith("https://") ?? false,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

const attempts = new Map<string, { count: number; until: number }>();
const ATTEMPT_WINDOW = 15 * 60 * 1000;
let activeVerifications = 0;

/** One server-wide budget also prevents forged forwarding headers bypassing limits. */
export function takeLoginAttempt(request: Request, now = Date.now()): number {
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  const address = (request.headers.get("x-forwarded-for") || "local")
    .split(",")[0]
    .trim()
    .slice(0, 100);
  const keys = [
    ["all", 30],
    [`ip:${address}`, 5],
  ] as const;
  for (const [key, limit] of keys) {
    const entry = attempts.get(key);
    if (entry && entry.count >= limit)
      return Math.ceil((entry.until - now) / 1000);
  }
  if (attempts.size >= 1000 || activeVerifications >= 2) return 2;
  for (const [key] of keys) {
    const entry = attempts.get(key) || {
      count: 0,
      until: now + ATTEMPT_WINDOW,
    };
    entry.count += 1;
    attempts.set(key, entry);
  }
  return 0;
}

export async function verifyLoginPassword(
  password: string,
  config: AccessConfig,
) {
  activeVerifications += 1;
  try {
    return await verifyPassword(password, config);
  } finally {
    activeVerifications -= 1;
  }
}

export function clearLoginAttempts(request: Request) {
  const address = (request.headers.get("x-forwarded-for") || "local")
    .split(",")[0]
    .trim()
    .slice(0, 100);
  attempts.delete(`ip:${address}`);
  const global = attempts.get("all");
  if (global) global.count = Math.max(0, global.count - 1);
}
