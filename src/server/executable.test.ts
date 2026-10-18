import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { verifyManifest, safeRuntimePath, download } = createRequire(
  import.meta.url,
)("../../deploy/executable.cjs");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const machineId = `mch_${"a".repeat(32)}`,
  nonce = "b".repeat(64);
const release = () => ({
  v: 1,
  app: "staiano-hvac",
  platform: "win32-x64",
  sequence: 2,
  commit: "c".repeat(40),
  sha256: "d".repeat(64),
  size: 10,
  url: "https://licenses.ivanbuonocore.dev/updates/download",
  machineId,
  nonce,
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 300,
});
const signed = (value: object) => {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${sign(null, Buffer.from(`staiano-update-v1.${body}`), privateKey).toString("base64url")}`;
};
afterEach(() => vi.unstubAllGlobals());

describe("aggiornamenti EXE", () => {
  it("accetta solo manifesti firmati per la postazione e la richiesta attuale", () => {
    expect(
      verifyManifest(signed(release()), publicKey, machineId, nonce, 1),
    ).toMatchObject({ sequence: 2 });
    for (const patch of [
      { machineId: "altra" },
      { nonce: "vecchia-richiesta" },
      { sequence: 0 },
      { expiresAt: 1 },
      { issuedAt: Math.floor(Date.now() / 1000) + 1000 },
      { url: "https://evil.example/StaianoHVAC.exe" },
      { commit: "../../bad" },
      { app: "altro" },
    ])
      expect(() =>
        verifyManifest(
          signed({ ...release(), ...patch }),
          publicKey,
          machineId,
          nonce,
          1,
        ),
      ).toThrow();
    const token = signed(release());
    expect(() =>
      verifyManifest(`${token}.extra`, publicKey, machineId, nonce),
    ).toThrow();
    expect(() =>
      verifyManifest(
        token.replace(token[0], token[0] === "a" ? "b" : "a"),
        publicKey,
        machineId,
        nonce,
      ),
    ).toThrow();
  });
  it("blocca percorsi che possono uscire dalla directory del programma", () => {
    expect(safeRuntimePath("C:\\runtime", "public/logo.svg")).toBe(
      path.join("C:\\runtime", "public", "logo.svg"),
    );
    for (const name of [
      "../segreti",
      "/absolute",
      "C:/segreti",
      "a\\b",
      "a//b",
      "a/../b",
      "a/./b",
    ])
      expect(() => safeRuntimePath("C:\\runtime", name)).toThrow();
  });
  it("respinge eseguibili alterati, incompleti e troppo grandi prima di eseguirli", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "staiano-update-"));
    try {
      for (const [index, content] of [
        "altered!!!",
        "short",
        "file-too-large",
      ].entries()) {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(new Response(content)),
        );
        await expect(
          download(release(), path.join(directory, `${index}.exe`)),
        ).rejects.toThrow();
        expect(
          (await readFile(path.join(directory, `${index}.exe`))).length,
        ).toBeLessThanOrEqual(10);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
