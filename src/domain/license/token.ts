/**
 * Contratto di licenza condiviso fra il server Cloudflare (`license-server/`) e
 * l'applicazione locale. Solo WebCrypto: nessuna API Node, così lo stesso codice
 * gira nel Worker e nel runtime Next.
 */

export const LICENSE_TOKEN_VERSION = 1;
export const LICENSE_TOKEN_ALGORITHM = "Ed25519";
export const LICENSE_KEY_PREFIX = "STAIANO";
/** Crockford base32: nessuna I, L, O, U per evitare errori di trascrizione. */
export const LICENSE_KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LICENSE_KEY_LENGTH = 20;

export type LicenseTokenPayload = {
  v: number;
  licenseId: string;
  customer: string;
  plan: string;
  seats: number;
  machineId: string;
  features: string[];
  issuedAt: number;
  expiresAt: number | null;
};

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** Accetta base64 standard e base64url, con o senza padding. */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  // Accetta sia un PEM multilinea sia un segreto con "\n" letterali.
  const body = pem
    .replaceAll("\\n", "\n")
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new Error("Chiave PEM non valida.");
  return base64ToBytes(body);
}

/** WebCrypto richiede viste su ArrayBuffer: copia esplicita dal TextEncoder. */
function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  return bytes;
}

function encodeJson(value: unknown): string {
  return base64UrlEncode(utf8(JSON.stringify(value)));
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64ToBytes(value)));
}

export function parseLicenseTokenPayload(
  value: unknown,
): LicenseTokenPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    payload.v !== LICENSE_TOKEN_VERSION ||
    typeof payload.licenseId !== "string" ||
    typeof payload.customer !== "string" ||
    typeof payload.plan !== "string" ||
    typeof payload.seats !== "number" ||
    typeof payload.machineId !== "string" ||
    !Array.isArray(payload.features) ||
    payload.features.some((feature) => typeof feature !== "string") ||
    typeof payload.issuedAt !== "number" ||
    !(
      payload.expiresAt === null ||
      payload.expiresAt === undefined ||
      typeof payload.expiresAt === "number"
    )
  )
    return null;
  return {
    v: LICENSE_TOKEN_VERSION,
    licenseId: payload.licenseId,
    customer: payload.customer,
    plan: payload.plan,
    seats: payload.seats,
    machineId: payload.machineId,
    features: payload.features as string[],
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt ?? null,
  };
}

export async function signLicenseToken(
  payload: LicenseTokenPayload,
  privateKeyPem: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: LICENSE_TOKEN_ALGORITHM },
    false,
    ["sign"],
  );
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    LICENSE_TOKEN_ALGORITHM,
    key,
    utf8(body),
  );
  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verifica solo firma e struttura: scadenza, revoca e macchina restano al
 * chiamante, che conosce la politica di accesso.
 */
export async function verifyLicenseToken(
  token: string,
  publicKeyPem: string,
): Promise<LicenseTokenPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      pemToDer(publicKeyPem),
      { name: LICENSE_TOKEN_ALGORITHM },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      LICENSE_TOKEN_ALGORITHM,
      key,
      base64ToBytes(signature),
      utf8(body),
    );
    if (!valid) return null;
    return parseLicenseTokenPayload(decodeJson(body));
  } catch {
    return null;
  }
}

/** Normalizza una chiave digitata a mano: prefisso, separatori e Crockford. */
export function normalizeLicenseKey(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^STAIANO/, "")
    .replaceAll("I", "1")
    .replaceAll("L", "1")
    .replaceAll("O", "0");
  return new RegExp(`^[${LICENSE_KEY_ALPHABET}]{${LICENSE_KEY_LENGTH}}$`).test(
    cleaned,
  )
    ? cleaned
    : "";
}

export function formatLicenseKey(value: string): string {
  const normalized = normalizeLicenseKey(value);
  if (!normalized) return "";
  const groups = normalized.match(/.{1,5}/g) ?? [];
  return `${LICENSE_KEY_PREFIX}-${groups.join("-")}`;
}

export function generateLicenseKey(random: Uint8Array): string {
  if (random.length < LICENSE_KEY_LENGTH) throw new Error("Entropia scarsa.");
  let key = "";
  for (let index = 0; index < LICENSE_KEY_LENGTH; index += 1)
    key += LICENSE_KEY_ALPHABET[random[index] % LICENSE_KEY_ALPHABET.length];
  return key;
}

export async function hashLicenseKey(value: string): Promise<string> {
  const normalized = normalizeLicenseKey(value);
  if (!normalized) throw new Error("Chiave di licenza non valida.");
  const digest = await crypto.subtle.digest("SHA-256", utf8(normalized));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isMachineId(value: unknown): value is string {
  return typeof value === "string" && /^mch_[0-9a-f]{32}$/.test(value);
}
