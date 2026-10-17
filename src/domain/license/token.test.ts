import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  base64UrlEncode,
  formatLicenseKey,
  generateLicenseKey,
  hashLicenseKey,
  isMachineId,
  LICENSE_KEY_ALPHABET,
  LICENSE_KEY_LENGTH,
  normalizeLicenseKey,
  parseLicenseTokenPayload,
  signLicenseToken,
  verifyLicenseToken,
  type LicenseTokenPayload,
} from "./token";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({
  type: "pkcs8",
  format: "pem",
}) as string;
const publicKeyPem = publicKey.export({
  type: "spki",
  format: "pem",
}) as string;
const otherKey = generateKeyPairSync("ed25519");

const payload: LicenseTokenPayload = {
  v: 1,
  licenseId: "lic_test",
  customer: "Termoidraulica Staiano",
  plan: "standard",
  seats: 1,
  machineId: "mch_0123456789abcdef0123456789abcdef",
  features: ["configurator"],
  issuedAt: 1_760_000_000,
  expiresAt: null,
};

describe("token di licenza", () => {
  it("firma con la chiave privata e verifica con la pubblica", async () => {
    const token = await signLicenseToken(payload, privateKeyPem);
    expect(token.split(".")).toHaveLength(2);
    await expect(verifyLicenseToken(token, publicKeyPem)).resolves.toEqual(
      payload,
    );
  });

  it("rifiuta una chiave pubblica diversa", async () => {
    const token = await signLicenseToken(payload, privateKeyPem);
    const foreign = otherKey.publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    await expect(verifyLicenseToken(token, foreign)).resolves.toBeNull();
  });

  it("rifiuta un payload alterato", async () => {
    const token = await signLicenseToken(payload, privateKeyPem);
    const [, signature] = token.split(".");
    const forged = base64UrlEncode(
      new TextEncoder().encode(
        JSON.stringify({ ...payload, customer: "Altro cliente" }),
      ),
    );
    await expect(
      verifyLicenseToken(`${forged}.${signature}`, publicKeyPem),
    ).resolves.toBeNull();
  });

  it("rifiuta token malformati", async () => {
    await expect(verifyLicenseToken("", publicKeyPem)).resolves.toBeNull();
    await expect(
      verifyLicenseToken("soloCorpo", publicKeyPem),
    ).resolves.toBeNull();
    await expect(
      verifyLicenseToken("corpo.firma", "non-un-pem"),
    ).resolves.toBeNull();
  });

  it("valida la struttura del payload", () => {
    expect(parseLicenseTokenPayload(payload)).toEqual(payload);
    expect(parseLicenseTokenPayload({ ...payload, v: 2 })).toBeNull();
    expect(parseLicenseTokenPayload({ ...payload, seats: "1" })).toBeNull();
    expect(parseLicenseTokenPayload({ ...payload, features: [1] })).toBeNull();
    expect(parseLicenseTokenPayload(null)).toBeNull();
    expect(
      parseLicenseTokenPayload({ ...payload, expiresAt: undefined }),
    ).toMatchObject({ expiresAt: null });
  });
});

describe("chiavi di licenza", () => {
  it("normalizza prefisso, separatori e caratteri Crockford", () => {
    const key = "0123456789ABCDEFGHJK";
    expect(normalizeLicenseKey(formatLicenseKey(key))).toBe(key);
    expect(normalizeLicenseKey(" staiano-0123-4567-89ab-cdef-ghjk ")).toBe(key);
    expect(normalizeLicenseKey("STAIANO-O123-4567-89AB-CDEF-GHJK")).toBe(key);
    expect(normalizeLicenseKey("troppo-corta")).toBe("");
    expect(normalizeLicenseKey("0123456789ABCDEFGHJU")).toBe("");
  });

  it("formatta in gruppi leggibili", () => {
    const key = "0123456789ABCDEFGHJK";
    expect(formatLicenseKey(key)).toBe("STAIANO-01234-56789-ABCDE-FGHJK");
    expect(formatLicenseKey("")).toBe("");
  });

  it("genera chiavi nel formato previsto", () => {
    const random = Uint8Array.from({ length: 32 }, (_, index) => index);
    const key = generateLicenseKey(random);
    expect(key).toHaveLength(LICENSE_KEY_LENGTH);
    expect(
      [...key].every((character) => LICENSE_KEY_ALPHABET.includes(character)),
    ).toBe(true);
    expect(normalizeLicenseKey(formatLicenseKey(key))).toBe(key);
    expect(() => generateLicenseKey(new Uint8Array(4))).toThrow();
  });

  it("calcola un hash stabile e distinto per chiave", async () => {
    const key = "0123456789ABCDEFGHJK";
    const digest = await hashLicenseKey(formatLicenseKey(key));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashLicenseKey(key)).toBe(digest);
    expect(await hashLicenseKey("0123456789ABCDEFGHJM")).not.toBe(digest);
    await expect(hashLicenseKey("non-valida")).rejects.toThrow();
  });

  it("riconosce gli identificativi macchina", () => {
    expect(isMachineId(payload.machineId)).toBe(true);
    expect(isMachineId("mch_ABC")).toBe(false);
    expect(isMachineId(null)).toBe(false);
  });
});

describe("base64", () => {
  it("codifica in base64url senza padding e rilegge", () => {
    const bytes = Uint8Array.from([0, 1, 250, 255, 62, 63]);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...base64ToBytes(encoded)]).toEqual([...bytes]);
    expect([...base64ToBytes("AAH6/z4/")]).toEqual([...bytes]);
  });
});
