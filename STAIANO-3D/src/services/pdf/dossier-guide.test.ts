import { expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { generateKeyPairSync } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { dossierFixture } from "./fixture";
import { buildDossier } from "./dossier";
import { dossierGuideLink, DOSSIER_GUIDE_URL } from "./dossier-guide";
import { renderDossierPdf } from "./render";
import { encryptDossier } from "./dossier-crypto";
import { decryptDossier } from "../../../dossier-guide/decrypt";
import worker from "../../../dossier-guide/worker";

it("keeps only ciphertext in the fragment and bounds printed QR size", async () => {
  const p = dossierFixture();
  p.name = "Progetto riservato è 漢字";
  p.rooms.push(
    ...Array.from({ length: 100 - p.rooms.length }, (_, i) => ({
      ...p.rooms[0],
      id: `room-${i}`,
      name: `Sala ${i} ${"漢".repeat(80)}`,
    })),
  );
  const url = new URL(
    await dossierGuideLink(
      buildDossier(p),
      "summary",
      new Date("2026-10-20T10:00:00Z"),
    ),
  );
  expect(`${url.origin}${url.pathname}`).toBe(DOSSIER_GUIDE_URL);
  expect(url.search).toBe("");
  expect(url.hash.length).toBeLessThan(1600);
  expect(url.hash).toMatch(/^#1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(url.hash).not.toContain("Progetto");
});

it("decrypts only in the Worker and rejects tampered, oversized and invalid requests", async () => {
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const snapshot = {
    v: 1,
    n: "Casa è 漢字",
    k: "complete",
    d: new Date().toISOString(),
    m: [2, 30, 81, 2835, 1, 2, 3, 0, 0, 1],
    r: ["Cucina", "Camera"],
  };
  const compress = (value: unknown) =>
    new Uint8Array(deflateRawSync(JSON.stringify(value)));
  const token = await encryptDossier(
    compress(snapshot),
    keys.publicKey.toString("base64"),
  );
  const second = await encryptDossier(
    compress(snapshot),
    keys.publicKey.toString("base64"),
  );
  expect(second).not.toBe(token);
  const privateKey = keys.privateKey.toString("base64");
  expect(await decryptDossier(token, privateKey)).toEqual(snapshot);
  const env = {
    DOSSIER_PRIVATE_KEY: privateKey,
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const post = (body: string) =>
    worker.fetch(
      new Request("https://example.test/api/dossier", { method: "POST", body }),
      env,
    );
  const response = await post(token);
  expect(await response.json()).toEqual(snapshot);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const parts = token.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  expect((await post(parts.join("."))).status).toBe(400);
  expect((await post("x".repeat(3001))).status).toBe(400);
  expect(
    (
      await post(
        await encryptDossier(
          compress({ ...snapshot, n: "x".repeat(20000) }),
          keys.publicKey.toString("base64"),
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (await worker.fetch(new Request("https://example.test/api/dossier"), env))
      .status,
  ).toBe(405);
});

it.each(["complete", "summary"] as const)(
  "adds the protected guide to the first page of the %s PDF",
  async (variant) => {
    const doc = await PDFDocument.load(
      await renderDossierPdf(dossierFixture(), { variant }),
    );
    const annotations = doc
      .getPage(0)
      .node.lookup(PDFName.of("Annots"), PDFArray);
    const link = annotations
      .lookup(0, PDFDict)
      .lookup(PDFName.of("A"), PDFDict)
      .lookup(PDFName.of("URI"), PDFString)
      .decodeText();
    expect(link.startsWith(DOSSIER_GUIDE_URL + "#1.")).toBe(true);
  },
);
