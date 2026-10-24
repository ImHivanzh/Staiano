import { createRequire } from "node:module";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  verifyManifest,
  safeRuntimePath,
  download,
  catalogDocuments,
  catalogExpected,
  verifyCatalogDocuments,
  ensureCatalogDocuments,
  pruneVersions,
  requireCurrentVersion,
} = createRequire(import.meta.url)("../../deploy/executable.cjs");
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
  it("avvia soltanto la revisione corrente firmata e si blocca senza verifica online", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "staiano-current-version-"),
    );
    try {
      await mkdir(path.join(directory, ".cache"));
      const config = { publicKey, commit: "c".repeat(40) };
      const request = vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            manifest: signed({
              ...release(),
              machineId: body.machineId,
              nonce: body.nonce,
            }),
          }),
        );
      });
      vi.stubGlobal("fetch", request);
      await expect(
        requireCurrentVersion(directory, config),
      ).resolves.toBeUndefined();
      expect(request.mock.calls[0][0]).toBe(
        "https://licenses.ivanbuonocore.dev/updates/version",
      );
      expect(
        JSON.parse(String(request.mock.calls[0][1].body)),
      ).not.toHaveProperty("licenseKey");
      await expect(
        requireCurrentVersion(directory, { ...config, commit: "a".repeat(40) }),
      ).rejects.toThrow("Aggiornamento obbligatorio");
      request.mockImplementation(
        async () =>
          new Response(JSON.stringify({ status: "current", release: null })),
      );
      await expect(requireCurrentVersion(directory, config)).rejects.toThrow(
        "Aggiornamento obbligatorio",
      );
      request.mockRejectedValue(new Error("offline"));
      await expect(requireCurrentVersion(directory, config)).rejects.toThrow(
        "offline",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
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

describe("documenti tecnici dell'EXE", () => {
  const dataRoots: string[] = [];
  const dataRoot = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "staiano-dati-"));
    dataRoots.push(directory);
    return directory;
  };
  afterEach(async () => {
    delete process.env.STAIANO_CATALOG_SOURCE;
    for (const directory of dataRoots.splice(0))
      await rm(directory, { recursive: true, force: true });
  });
  it("conta solo i documenti previsti, anche in sottocartelle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "staiano-fonti-"));
    try {
      expect(catalogDocuments(root)).toEqual({ total: 0, byExtension: {} });
      await mkdir(path.join(root, "ecoclima"), { recursive: true });
      await mkdir(path.join(root, "ecoclima", "manuale.pdf"), {
        recursive: true,
      });
      for (const name of [
        "a.pdf",
        "b.PDF",
        "ecoclima/c.html",
        "ecoclima/c.json",
        "ecoclima/d.xlsx",
        "ecoclima/e.xls",
        "ecoclima/f.txt",
        "ecoclima/foto.png",
      ])
        await writeFile(path.join(root, name), "documento");
      expect(catalogDocuments(root)).toEqual({
        total: 6,
        byExtension: { ".pdf": 2, ".html": 1, ".json": 1, ".xlsx": 1, ".xls": 1 },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("scrive le istruzioni esatte finché i documenti non sono completi", async () => {
    const root = await dataRoot();
    const instructions = path.join(
      root,
      "catalog-data",
      "ISTRUZIONI-DOCUMENTI.txt",
    );
    const manifestFile = path.join(
      root,
      "catalog-data",
      "sources-manifest.json",
    );
    const status = () =>
      readFile(
        path.join(root, ".cache", "catalog-documents.json"),
        "utf8",
      ).then(JSON.parse);
    expect(ensureCatalogDocuments(root)).toEqual({ total: 0, byExtension: {} });
    const text = await readFile(instructions, "utf8");
    expect(text).toContain(
      `robocopy "<PERCORSO DELLA COPIA DI SVILUPPO>\\catalog-data\\sources" "${path.join(root, "catalog-data", "sources")}" *.pdf *.html *.json *.xlsx *.xls /S`,
    );
    expect(text).toContain("SHA-256");
    expect(text).toContain("sources:fetch");
    expect(text).toContain("STAIANO_CATALOG_SOURCE=");
    expect(await status()).toMatchObject({
      documents: 0,
      expected: 0,
      missing: [],
      instructions,
    });
    const documents = [
      {
        sha256: createHash("sha256").update("listino").digest("hex"),
        manufacturer: "Ecoclima",
        sourceUrl: "https://ecoclima.example/listino.pdf",
      },
      {
        sha256: createHash("sha256").update("scheda").digest("hex"),
        manufacturer: "Cordivari",
        sourceUrl: "https://cordivari.example/scheda.pdf",
      },
    ];
    await writeFile(manifestFile, JSON.stringify({ version: 1, documents }));
    expect(catalogExpected(root)).toBe(2);
    process.env.STAIANO_CATALOG_SOURCE = "\\\\server\\condivisione\\fonti";
    await mkdir(path.join(root, "catalog-data", "sources", "ecoclima"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "catalog-data", "sources", "ecoclima", "listino.pdf"),
      "listino",
    );
    const partial = await verifyCatalogDocuments(root);
    expect(partial.missing).toEqual([documents[1]]);
    const incomplete = await readFile(instructions, "utf8");
    expect(incomplete).toContain("Documenti attesi:  2 (mancanti: 1)");
    expect(incomplete).toContain(
      "Cordivari: https://cordivari.example/scheda.pdf",
    );
    expect(incomplete).toContain('robocopy "\\\\server\\condivisione\\fonti"');
    expect(await status()).toMatchObject({
      documents: 1,
      expected: 2,
      sourceHint: "\\\\server\\condivisione\\fonti",
      instructions,
    });
    await writeFile(
      path.join(root, "catalog-data", "sources", "cordivari.pdf"),
      "scheda",
    );
    expect((await verifyCatalogDocuments(root)).missing).toEqual([]);
    expect(await status()).toMatchObject({
      documents: 2,
      expected: 2,
      missing: [],
      instructions: null,
    });
    await expect(readFile(instructions, "utf8")).rejects.toThrow();
    expect(ensureCatalogDocuments(root)).toEqual({
      total: 2,
      byExtension: { ".pdf": 2 },
    });
    await expect(readFile(instructions, "utf8")).rejects.toThrow();
  });
});

describe("pulizia delle versioni EXE", () => {
  it("elimina gli EXE precedenti e conserva solo la versione attiva", async () => {
    const install = await mkdtemp(path.join(tmpdir(), "staiano-versioni-"));
    try {
      const keep = "a".repeat(64),
        old = "b".repeat(64),
        older = "c".repeat(64);
      for (const name of [keep, old, older]) {
        await mkdir(path.join(install, "versions", name), { recursive: true });
        await writeFile(
          path.join(install, "versions", name, "StaianoHVAC.exe"),
          name,
        );
      }
      pruneVersions(install, keep);
      expect((await readdir(path.join(install, "versions"))).sort()).toEqual([
        keep,
      ]);
    } finally {
      await rm(install, { recursive: true, force: true });
    }
  });
});
