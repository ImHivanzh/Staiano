import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile, stat, rename, writeFile, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const SESSION_COOKIE = "staiano_session";
export const SESSION_SECONDS = 8 * 60 * 60;

export interface AccessConfig {
  version: 1;
  salt: string;
  passwordHash: string;
  sessionSecret: string;
  users?: AccessUser[];
}

export interface AccessUser {
  username: string;
  displayName: string;
  role: "admin" | "operator";
  salt: string;
  passwordHash: string;
  revision: number;
  disabled: boolean;
  mustChangePassword: boolean;
}

export type SessionUser = Pick<
  AccessUser,
  "username" | "displayName" | "role" | "revision" | "mustChangePassword"
>;
export type ManagedUser = SessionUser & { disabled: boolean };

export class AccountManagementError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validUsers(users: unknown): users is AccessUser[] {
  if (!Array.isArray(users) || !users.length || users.length > 100)
    return false;
  const names = new Set<string>();
  for (const user of users) {
    if (
      !user ||
      typeof user.username !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{1,39}$/.test(user.username) ||
      names.has(user.username) ||
      typeof user.displayName !== "string" ||
      !user.displayName ||
      user.displayName.length > 80 ||
      !["admin", "operator"].includes(user.role) ||
      !/^[a-f0-9]{64}$/.test(user.salt) ||
      !/^[a-f0-9]{128}$/.test(user.passwordHash) ||
      !Number.isSafeInteger(user.revision) ||
      user.revision < 1 ||
      typeof user.disabled !== "boolean" ||
      typeof user.mustChangePassword !== "boolean"
    )
      return false;
    names.add(user.username);
  }
  return users.some((user) => user.role === "admin" && !user.disabled);
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
      !/^[a-f0-9]{64}$/.test(config.sessionSecret) ||
      (config.users !== undefined && !validUsers(config.users))
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
  config: Pick<AccessConfig, "salt" | "passwordHash">,
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

export function createSession(
  config: AccessConfig,
  now = Date.now(),
  user?: SessionUser,
): string {
  const identity =
    user ||
    config.users?.find(
      (candidate) => candidate.username === "admin" && !candidate.disabled,
    );
  if (config.users && !identity) throw new Error("Account non disponibile.");
  const nonce = randomBytes(24).toString("base64url");
  const payload = identity
    ? `v2.${Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, sub: identity.username, role: identity.role, rev: identity.revision, nonce })).toString("base64url")}`
    : `${Math.floor(now / 1000) + SESSION_SECONDS}.${nonce}`;
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
  return getSessionUser(value, config, now) !== null;
}

export function getSessionUser(
  value: string | undefined,
  config: AccessConfig,
  now = Date.now(),
): SessionUser | null {
  if (!value || value.length > 512) return null;
  const parts = value.split(".");
  if (
    parts.length === 3 &&
    parts[0] === "v2" &&
    /^[\w-]+$/.test(parts[1]) &&
    /^[\w-]{43}$/.test(parts[2])
  ) {
    const expected = createHmac(
      "sha256",
      Buffer.from(config.sessionSecret, "hex"),
    )
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const signature = Buffer.from(parts[2], "base64url");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      return null;
    try {
      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
      const seconds = Math.floor(now / 1000);
      if (
        !Number.isSafeInteger(claims.exp) ||
        claims.exp <= seconds ||
        claims.exp > seconds + SESSION_SECONDS ||
        !/^[\w-]{32}$/.test(claims.nonce)
      )
        return null;
      const user = config.users?.find(
        (candidate) =>
          candidate.username === claims.sub &&
          !candidate.disabled &&
          candidate.revision === claims.rev &&
          candidate.role === claims.role,
      );
      return user ? publicUser(user) : null;
    } catch {
      return null;
    }
  }
  // Single-password sessions stop being valid once named accounts are enabled.
  if (config.users) return null;
  if (
    parts.length !== 3 ||
    !/^\d{10}$/.test(parts[0]) ||
    !/^[\w-]{32}$/.test(parts[1]) ||
    !/^[\w-]{43}$/.test(parts[2])
  )
    return null;
  const expires = Number(parts[0]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + SESSION_SECONDS) return null;
  const expected = createHmac(
    "sha256",
    Buffer.from(config.sessionSecret, "hex"),
  )
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const signature = Buffer.from(parts[2], "base64url");
  return signature.length === expected.length &&
    timingSafeEqual(signature, expected)
    ? {
        username: "admin",
        displayName: "Ivan",
        role: "admin",
        revision: 1,
        mustChangePassword: false,
      }
    : null;
}

export function publicUser(user: AccessUser): SessionUser {
  return {
    username: user.username,
    displayName: user.username === "admin" ? "Ivan" : user.displayName,
    role: user.role,
    revision: user.revision,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function authenticateUser(
  username: string,
  password: string,
  config: AccessConfig,
): Promise<SessionUser | null> {
  const normalized = normalizeUsername(username);
  if (!config.users)
    return (!normalized || normalized === "admin") &&
      (await verifyLoginPassword(password, config))
      ? {
          username: "admin",
          displayName: "Ivan",
          role: "admin",
          revision: 1,
          mustChangePassword: false,
        }
      : null;
  const user = config.users.find(
    (candidate) => candidate.username === normalized,
  );
  // Perform the same password work for unknown/disabled users to avoid account enumeration.
  const correct = await verifyLoginPassword(password, user || config);
  return correct && user && !user.disabled ? publicUser(user) : null;
}

const accountWriteState = globalThis as typeof globalThis & {
  staianoAccountWrite?: Promise<void>;
};

// ponytail: one server process owns the file; use a transactional store if
// several app processes must mutate the same account file concurrently.
function updateAccounts(operation: () => Promise<void>) {
  const result = (
    accountWriteState.staianoAccountWrite ?? Promise.resolve()
  ).then(operation);
  accountWriteState.staianoAccountWrite = result.catch(() => undefined);
  return result;
}

async function writeAccessConfig(nextConfig: AccessConfig) {
  const file = resolve(
    /* turbopackIgnore: true */
    process.env.AUTH_FILE ||
      resolve(
        /* turbopackIgnore: true */ process.cwd(),
        ".cache/app-auth.json",
      ),
  );
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(
      /* turbopackIgnore: true */ temporary,
      `${JSON.stringify(nextConfig)}\n`,
      {
        flag: "wx",
        mode: 0o600,
      },
    );
    if (process.platform === "win32") {
      const output = execFileSync(
        "whoami.exe",
        ["/user", "/fo", "csv", "/nh"],
        { encoding: "utf8", windowsHide: true },
      );
      const sid = output.match(/S-1-\d+(?:-\d+)+/)?.[0];
      if (!sid) throw new Error("permissions");
      execFileSync(
        "icacls.exe",
        [
          temporary,
          "/inheritance:r",
          "/grant:r",
          `*${sid}:(F)`,
          "*S-1-5-18:(F)",
          "*S-1-5-32-544:(F)",
        ],
        { stdio: "ignore", windowsHide: true },
      );
    }
    await rename(
      /* turbopackIgnore: true */ temporary,
      /* turbopackIgnore: true */ file,
    );
    cached = undefined;
  } finally {
    await unlink(/* turbopackIgnore: true */ temporary).catch(() => undefined);
  }
}

function accountUsers(config: AccessConfig): AccessUser[] {
  return (
    config.users ?? [
      {
        username: "admin",
        displayName: "Ivan",
        role: "admin",
        salt: config.salt,
        passwordHash: config.passwordHash,
        revision: 1,
        disabled: false,
        mustChangePassword: false,
      },
    ]
  );
}

export function managedUsers(config: AccessConfig): ManagedUser[] {
  return accountUsers(config).map((user) => ({
    ...publicUser(user),
    disabled: user.disabled,
  }));
}

async function passwordCredentials(password: string) {
  if (
    password.length < 12 ||
    password.length > 256 ||
    /[\x00-\x1f\x7f]/.test(password)
  )
    throw new AccountManagementError(
      "Scegli una password fra 12 e 256 caratteri.",
    );
  const salt = randomBytes(32).toString("hex");
  const passwordHash = await new Promise<string>((accept, reject) =>
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 16384, r: 8, p: 1 },
      (error, key) => (error ? reject(error) : accept(key.toString("hex"))),
    ),
  );
  return { salt, passwordHash };
}

/** Only an active administrator can create accounts or reset another password. */
export async function manageUser(
  session: SessionUser,
  action: "create" | "reset",
  input: { username: string; displayName?: string; password: string },
): Promise<ManagedUser> {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username))
    throw new AccountManagementError(
      "Nome utente: 2–40 caratteri, lettere minuscole, numeri, punto, trattino o underscore.",
    );
  const displayName = input.displayName?.trim() ?? "";
  if (
    action === "create" &&
    (!displayName ||
      displayName.length > 80 ||
      /[\x00-\x1f\x7f]/.test(displayName))
  )
    throw new AccountManagementError(
      "Inserisci un nome visualizzato fra 1 e 80 caratteri.",
    );
  let updated!: ManagedUser;
  await updateAccounts(async () => {
    const config = await getAccessConfig(),
      users = accountUsers(config);
    const actor = users.find(
      (u) =>
        u.username === session.username &&
        u.revision === session.revision &&
        !u.disabled,
    );
    if (
      !actor ||
      session.role !== "admin" ||
      actor.role !== "admin" ||
      actor.mustChangePassword
    )
      throw new AccountManagementError(
        "Operazione riservata all’amministratore attivo.",
        403,
      );
    const existing = users.find((u) => u.username === username);
    if (action === "create" && existing)
      throw new AccountManagementError("Nome utente già presente.", 409);
    if (action === "create" && users.length >= 100)
      throw new AccountManagementError("Limite di 100 utenti raggiunto.");
    if (action === "reset" && !existing)
      throw new AccountManagementError("Utente non trovato.", 404);
    if (action === "reset" && username === actor.username)
      throw new AccountManagementError(
        "Per la tua password usa il cambio password personale.",
      );
    const credentials = await passwordCredentials(input.password);
    const nextUser: AccessUser =
      action === "create"
        ? {
            username,
            displayName,
            role: "operator",
            ...credentials,
            revision: 1,
            disabled: false,
            mustChangePassword: true,
          }
        : {
            ...existing!,
            ...credentials,
            revision: existing!.revision + 1,
            mustChangePassword: true,
          };
    const nextUsers =
      action === "create"
        ? [...users, nextUser]
        : users.map((u) => (u.username === username ? nextUser : u));
    const nextConfig: AccessConfig = { ...config, users: nextUsers };
    if (username === "admin") {
      nextConfig.salt = nextUser.salt;
      nextConfig.passwordHash = nextUser.passwordHash;
    }
    await writeAccessConfig(nextConfig);
    updated = { ...publicUser(nextUser), disabled: nextUser.disabled };
  });
  return updated;
}

/** Serialize changes and re-read the current revision before replacing private credentials. */
export async function changeUserPassword(
  session: SessionUser,
  password: string,
): Promise<SessionUser> {
  if (
    password.length < 12 ||
    password.length > 256 ||
    /[\x00-\x1f\x7f]/.test(password)
  )
    throw new Error("Scegli una password fra 12 e 256 caratteri.");
  let updated!: SessionUser;
  const operation = updateAccounts(async () => {
    const config = await getAccessConfig();
    const users = accountUsers(config);
    const user = users.find(
      (candidate) =>
        candidate.username === session.username &&
        candidate.revision === session.revision &&
        !candidate.disabled,
    );
    if (!user) throw new Error("Sessione scaduta.");
    if (await verifyPassword(password, user))
      throw new Error(
        "La nuova password deve essere diversa da quella attuale.",
      );
    const { salt, passwordHash } = await passwordCredentials(password);
    const nextUser = {
      ...user,
      salt,
      passwordHash,
      revision: user.revision + 1,
      mustChangePassword: false,
    };
    const nextConfig = {
      ...config,
      users: users.map((candidate) =>
        candidate.username === user.username ? nextUser : candidate,
      ),
    };
    if (user.username === "admin") {
      nextConfig.salt = salt;
      nextConfig.passwordHash = passwordHash;
    }
    await writeAccessConfig(nextConfig);
    updated = publicUser(nextUser);
  });
  await operation;
  return updated;
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
  config: Pick<AccessConfig, "salt" | "passwordHash">,
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
