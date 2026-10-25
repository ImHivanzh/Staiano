import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { hostname, networkInterfaces, platform } from "node:os";
import { dirname, resolve } from "node:path";
import {
  isMachineId,
  normalizeLicenseKey,
  verifyLicenseToken,
  type LicenseTokenPayload,
} from "@/domain/license/token";

/**
 * Controllo di licenza locale.
 *
 * La licenza è legata a questa postazione: il server Cloudflare (`license-server/`)
 * rilascia un token firmato Ed25519 che qui viene verificato offline. Il server
 * resta l'unico punto di revoca, quindi ogni `LICENSE_CHECK_MINUTES` il token
 * viene rinnovato: se la licenza viene disattivata l'app si blocca, e se il
 * server non risponde oltre `LICENSE_TOLERANCE_MINUTES` anche l'app non risponde.
 */

const CACHE_MS = 10_000;
const REQUEST_TIMEOUT_MS = 6_000;

export class LicenseError extends Error {}

export type LicenseState =
  | "active"
  | "disabled"
  | "missing"
  | "unconfigured"
  | "invalid"
  | "revoked"
  | "expired"
  | "unreachable"
  | "update-required"
  | "seats-exhausted";

export type LicenseStatus = {
  ok: boolean;
  state: LicenseState;
  enforce: boolean;
  machineId: string;
  serverUrl: string;
  licenseId: string | null;
  customer: string | null;
  plan: string | null;
  expiresAt: number | null;
  notBefore: number | null;
  lastVerifiedAt: number | null;
  activatedAt: number | null;
  message: string;
};

export type LicenseFileState = {
  version: 1;
  key: string;
  licenseId: string;
  machineId: string;
  token: string;
  serverUrl: string;
  customer: string | null;
  plan: string | null;
  activatedAt: number;
  lastVerifiedAt: number;
};

function envValue(name: string): string {
  return (process.env[name] ?? "").trim();
}

function envNumber(name: string): number | null {
  const raw = envValue(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function licenseServerUrl(): string {
  return envValue("LICENSE_SERVER_URL").replace(/\/+$/, "");
}

export function licenseEnforced(): boolean {
  return ["1", "true", "yes", "on"].includes(
    envValue("LICENSE_ENFORCE").toLowerCase(),
  );
}

export function licenseToleranceMs(): number {
  const minutes = envNumber("LICENSE_TOLERANCE_MINUTES");
  return (minutes !== null && minutes >= 0 ? minutes : 30) * 60_000;
}

export function licenseCheckMs(): number {
  const minutes = envNumber("LICENSE_CHECK_MINUTES");
  return (minutes !== null && minutes > 0 ? minutes : 10) * 60_000;
}

export function licenseFilePath(): string {
  return resolve(
    /* turbopackIgnore: true */
    envValue("LICENSE_FILE") ||
      resolve(/* turbopackIgnore: true */ process.cwd(), ".cache/license.json"),
  );
}

export function licensePublicKeyFile(): string {
  return resolve(
    /* turbopackIgnore: true */
    envValue("LICENSE_PUBLIC_KEY_FILE") ||
      resolve(
        /* turbopackIgnore: true */ process.cwd(),
        ".cache/license-public.pem",
      ),
  );
}

function appVersion(): string {
  return envValue("LICENSE_APP_VERSION") || "1.0.0";
}

export async function licensePublicKey(): Promise<string | null> {
  const inline = process.env.LICENSE_PUBLIC_KEY;
  if (inline && inline.trim()) return inline;
  try {
    return await readFile(licensePublicKeyFile(), "utf8");
  } catch {
    return null;
  }
}

function windowsMachineGuid(): string | null {
  if (platform() !== "win32") return null;
  try {
    const output = execFileSync(
      "reg.exe",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8", windowsHide: true },
    );
    return (
      output.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/)?.[1] ?? null
    );
  } catch {
    return null;
  }
}

function unixMachineId(): string | null {
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const value = readFileSync(
        /* turbopackIgnore: true */ candidate,
        "utf8",
      ).trim();
      if (value) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function machineMacs(): string[] {
  const addresses = Object.values(networkInterfaces()).flatMap(
    (entries) => entries ?? [],
  );
  return [
    ...new Set(
      addresses
        .filter(
          (entry) =>
            !entry.internal &&
            entry.mac &&
            entry.mac !== "00:00:00:00:00:00" &&
            !entry.mac.startsWith("00:00:00"),
        )
        .map((entry) => entry.mac),
    ),
  ].sort();
}

/** Componenti stabili della macchina: sistema, nome host, identificativo e MAC. */
export function machineComponents(): string[] {
  const parts = [`platform:${platform()}`, `host:${hostname()}`];
  const identifier =
    platform() === "win32" ? windowsMachineGuid() : unixMachineId();
  if (identifier) parts.push(`id:${identifier}`);
  const macs = machineMacs();
  if (macs.length) parts.push(`mac:${macs[0]}`);
  return parts;
}

export function machineFingerprint(
  components: string[] = machineComponents(),
): string {
  const digest = createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .slice(0, 32);
  return `mch_${digest}`;
}

export function machineId(): string {
  return machineFingerprint();
}

/** A new virtual adapter must not invalidate a signed token for an adapter still on this host. */
export function machineFingerprintMatches(
  machineId: string,
  components = machineComponents(),
  macs = machineMacs(),
): boolean {
  if (machineId === machineFingerprint(components)) return true;
  if (!components.some((part) => part.startsWith("id:"))) return false;
  const stable = components.filter((part) => !part.startsWith("mac:"));
  return macs.some(
    (mac) => machineId === machineFingerprint([...stable, `mac:${mac}`]),
  );
}

function isLicenseFileState(value: unknown): value is LicenseFileState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    state.version === 1 &&
    typeof state.key === "string" &&
    typeof state.licenseId === "string" &&
    isMachineId(state.machineId) &&
    typeof state.token === "string" &&
    typeof state.serverUrl === "string" &&
    typeof state.activatedAt === "number" &&
    typeof state.lastVerifiedAt === "number"
  );
}

export async function readLicenseFile(): Promise<LicenseFileState | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(licenseFilePath(), "utf8"),
    );
    return isLicenseFileState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function restrictToCurrentUser(path: string): void {
  if (platform() !== "win32") return;
  try {
    const output = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const sid = output.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) return;
    execFileSync(
      "icacls.exe",
      [
        path,
        "/inheritance:r",
        "/grant:r",
        `*${sid}:(F)`,
        "*S-1-5-18:(F)",
        "*S-1-5-32-544:(F)",
      ],
      { stdio: "ignore", windowsHide: true },
    );
  } catch {
    return;
  }
}

export async function writeLicenseFile(state: LicenseFileState): Promise<void> {
  const target = licenseFilePath();
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  restrictToCurrentUser(temporary);
  await rename(temporary, target);
}

export async function clearLicenseFile(): Promise<void> {
  await rm(licenseFilePath(), { force: true });
  invalidateLicenseCache();
}

type ServerResponse = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

async function callServer(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<ServerResponse> {
  const serverUrl = licenseServerUrl();
  if (!serverUrl) throw new LicenseError("Server licenze non configurato.");
  const response = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `staiano-hvac/${appVersion()}`,
    },
    body: JSON.stringify({ ...payload, productId: "staiano-hvac" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, status: response.status, body };
}

function baseStatus(): LicenseStatus {
  return {
    ok: false,
    state: "missing",
    enforce: licenseEnforced(),
    machineId: machineFingerprint(),
    serverUrl: licenseServerUrl(),
    licenseId: null,
    customer: null,
    plan: null,
    expiresAt: null,
    notBefore: null,
    lastVerifiedAt: null,
    activatedAt: null,
    message: "",
  };
}

function fileStatus(
  state: LicenseFileState,
  payload: LicenseTokenPayload | null,
): Partial<LicenseStatus> {
  return {
    licenseId: state.licenseId,
    customer: state.customer,
    plan: state.plan,
    expiresAt: payload?.expiresAt ?? null,
    notBefore: payload ? payload.issuedAt * 1000 : null,
    lastVerifiedAt: state.lastVerifiedAt,
    activatedAt: state.activatedAt,
  };
}

async function refreshLicense(
  state: LicenseFileState,
  options: { blocking: boolean },
): Promise<LicenseStatus> {
  const status = baseStatus();
  const machineId = state.machineId;
  status.machineId = machineId;
  const info = fileStatus(state, null);
  try {
    const response = await callServer("/verify", {
      licenseKey: state.key,
      machineId,
      hostname: hostname(),
      appVersion: appVersion(),
      packaged: process.env.STAIANO_PACKAGED === "1",
    });
    if (response.status === 426)
      return {
        ...status,
        ...info,
        ok: false,
        state: "update-required",
        message:
          "Aggiornamento obbligatorio: installare l'ultima versione di Staiano HVAC prima di avviare il programma.",
      };
    if ([403, 404, 409].includes(response.status)) {
      const revoked: LicenseStatus = {
        ...status,
        ...info,
        ok: false,
        state: "revoked",
        message:
          typeof response.body.message === "string"
            ? response.body.message
            : "Licenza disattivata dal server.",
      };
      await clearLicenseFile();
      return revoked;
    }
    if (!response.ok)
      throw new LicenseError(
        typeof response.body.message === "string"
          ? response.body.message
          : "Verifica della licenza rifiutata.",
      );
    const publicKey = await licensePublicKey();
    const token =
      typeof response.body.token === "string" ? response.body.token : "";
    const payload =
      publicKey && token ? await verifyLicenseToken(token, publicKey) : null;
    if (
      !payload ||
      payload.machineId !== machineId ||
      (payload.productId ?? "staiano-hvac") !== "staiano-hvac"
    )
      throw new LicenseError("Risposta del server licenze non valida.");
    const next: LicenseFileState = {
      ...state,
      token,
      licenseId: payload.licenseId,
      customer: payload.customer,
      plan: payload.plan,
      lastVerifiedAt: Date.now(),
    };
    await writeLicenseFile(next);
    invalidateLicenseCache();
    return {
      ...status,
      ...fileStatus(next, payload),
      ok: true,
      state: "active",
      message: "Licenza attiva.",
    };
  } catch (error) {
    if (!options.blocking)
      return {
        ...status,
        ...info,
        ok: false,
        state: "unreachable",
        message: "",
      };
    return {
      ...status,
      ...info,
      ok: false,
      state: "unreachable",
      message:
        error instanceof LicenseError
          ? error.message
          : "Server licenze non raggiungibile: la postazione resta bloccata finché la licenza non viene verificata.",
    };
  }
}

async function evaluate(): Promise<LicenseStatus> {
  const status = baseStatus();
  const state = await readLicenseFile();
  if (!status.enforce)
    return {
      ...status,
      ...(state ? fileStatus(state, null) : {}),
      ok: true,
      state: "disabled",
      message: "Controllo licenza non attivo su questo server.",
    };
  if (!state)
    return {
      ...status,
      state: "missing",
      message: "Nessuna licenza attiva su questa postazione.",
    };
  if (!status.serverUrl || !(await licensePublicKey()))
    return {
      ...status,
      ...fileStatus(state, null),
      state: "unconfigured",
      message:
        "Server licenze non configurato: impostare LICENSE_SERVER_URL e la chiave pubblica.",
    };
  const publicKey = await licensePublicKey();
  const payload = publicKey
    ? await verifyLicenseToken(state.token, publicKey)
    : null;
  if (
    !payload ||
    !machineFingerprintMatches(payload.machineId) ||
    payload.machineId !== state.machineId ||
    (payload.productId ?? "staiano-hvac") !== "staiano-hvac"
  )
    return {
      ...status,
      ...fileStatus(state, null),
      state: "invalid",
      message: "Licenza locale non valida per questa postazione.",
    };
  status.machineId = payload.machineId;
  if (payload.licenseId !== state.licenseId)
    return {
      ...status,
      ...fileStatus(state, null),
      state: "invalid",
      message: "Licenza locale non coerente con il token firmato.",
    };
  if (payload.expiresAt && payload.expiresAt * 1000 < Date.now())
    return {
      ...status,
      ...fileStatus(state, payload),
      state: "expired",
      message: "Licenza scaduta: contattare l'assistenza.",
    };
  // Offline freshness comes from the signed timestamp, never from the editable cache.
  const age =
    Date.now() - Math.min(state.lastVerifiedAt, payload.issuedAt * 1000);
  if (payload.issuedAt * 1000 > Date.now() + 60_000)
    return {
      ...status,
      ...fileStatus(state, payload),
      state: "invalid",
      message:
        "Data del token non valida. Verificare l'orologio e riattivare la licenza.",
    };
  if (age > licenseToleranceMs())
    return refreshLicense(state, { blocking: true });
  if (process.env.STAIANO_PACKAGED === "1" && age > licenseCheckMs())
    return refreshLicense(state, { blocking: true });
  if (age > licenseCheckMs() && Date.now() - lastRefreshAttemptAt > 60_000) {
    lastRefreshAttemptAt = Date.now();
    void refreshLicense(state, { blocking: false });
  }
  return {
    ...status,
    ...fileStatus(state, payload),
    ok: true,
    state: "active",
    message: "Licenza attiva.",
  };
}

let cached: { at: number; status: LicenseStatus } | null = null;
let inFlight: Promise<LicenseStatus> | null = null;
let lastRefreshAttemptAt = 0;

export function invalidateLicenseCache(): void {
  cached = null;
}

/** Stato della licenza, con cache breve per non ripetere la verifica a ogni richiesta. */
export async function licenseStatus(
  options: { force?: boolean } = {},
): Promise<LicenseStatus> {
  if (!options.force && cached && Date.now() - cached.at < CACHE_MS)
    return cached.status;
  if (inFlight) return inFlight;
  inFlight = evaluate()
    .then((status) => {
      cached = { at: Date.now(), status };
      return status;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function licenseSetup(): Promise<{
  enforced: boolean;
  serverUrl: string;
  publicKey: boolean;
  machineId: string;
  filePath: string;
  filePresent: boolean;
  toleranceMinutes: number;
  checkMinutes: number;
}> {
  return {
    enforced: licenseEnforced(),
    serverUrl: licenseServerUrl(),
    publicKey: (await licensePublicKey()) !== null,
    machineId: (await licenseStatus()).machineId,
    filePath: licenseFilePath(),
    filePresent: (await readLicenseFile()) !== null,
    toleranceMinutes: Math.round(licenseToleranceMs() / 60_000),
    checkMinutes: Math.round(licenseCheckMs() / 60_000),
  };
}

export function buildInfo(): {
  buildId: string;
  commit: string;
  packaged: boolean;
} {
  return {
    buildId: (process.env.STAIANO_RELEASE_ID ?? "").trim() || "development",
    commit: (process.env.LICENSE_APP_VERSION ?? "").trim(),
    packaged: process.env.STAIANO_PACKAGED === "1",
  };
}

export async function activateLicense(value: string): Promise<LicenseStatus> {
  const key = normalizeLicenseKey(value);
  if (!key) throw new LicenseError("Chiave di licenza non valida.");
  const serverUrl = licenseServerUrl();
  if (!serverUrl)
    throw new LicenseError(
      "Server licenze non configurato: impostare LICENSE_SERVER_URL.",
    );
  const publicKey = await licensePublicKey();
  if (!publicKey)
    throw new LicenseError(
      "Chiave pubblica di licenza mancante: eseguire npm run license:keys.",
    );
  const machineId = machineFingerprint();
  let response: ServerResponse;
  try {
    response = await callServer("/activate", {
      licenseKey: key,
      machineId,
      hostname: hostname(),
      appVersion: appVersion(),
      packaged: process.env.STAIANO_PACKAGED === "1",
    });
  } catch {
    throw new LicenseError(
      "Server licenze non raggiungibile. Verificare la connessione e riprovare.",
    );
  }
  if (!response.ok)
    throw new LicenseError(
      typeof response.body.message === "string"
        ? response.body.message
        : "Attivazione rifiutata dal server.",
    );
  const token =
    typeof response.body.token === "string" ? response.body.token : "";
  const payload = token ? await verifyLicenseToken(token, publicKey) : null;
  if (
    !payload ||
    payload.machineId !== machineId ||
    (payload.productId ?? "staiano-hvac") !== "staiano-hvac"
  )
    throw new LicenseError("Risposta del server licenze non valida.");
  const now = Date.now();
  await writeLicenseFile({
    version: 1,
    key,
    licenseId: payload.licenseId,
    machineId,
    token,
    serverUrl,
    customer: payload.customer,
    plan: payload.plan,
    activatedAt: now,
    lastVerifiedAt: now,
  });
  invalidateLicenseCache();
  return licenseStatus({ force: true });
}

export async function deactivateLicense(): Promise<LicenseStatus> {
  const state = await readLicenseFile();
  if (!state) return licenseStatus({ force: true });
  try {
    const response = await callServer("/deactivate", {
      licenseKey: state.key,
      machineId: state.machineId,
    });
    if (!response.ok)
      throw new LicenseError("Disattivazione rifiutata dal server.");
  } catch {
    throw new LicenseError(
      "Server licenze non raggiungibile: la postazione non è stata liberata.",
    );
  }
  await clearLicenseFile();
  return licenseStatus({ force: true });
}
