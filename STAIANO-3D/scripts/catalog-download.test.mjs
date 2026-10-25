import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { downloadCatalogSource } from "./catalog-download.mjs";

const content = Buffer.from("%PDF-1.7 source fixture");
const document = {
  sourceUrl: "https://example.test/catalog.pdf",
  sha256: createHash("sha256").update(content).digest("hex"),
};
afterEach(() => mock.restoreAll());

test("recovers rate limits and temporary server errors, preserving exact bytes", async () => {
  const responses = [
    new Response(null, { status: 429, headers: { "Retry-After": "0" } }),
    new Response(null, { status: 503, headers: { "Retry-After": "0" } }),
    new Response(content, { headers: { "Content-Type": "application/pdf" } }),
  ];
  const request = mock.method(globalThis, "fetch", async () =>
    responses.shift(),
  );
  assert.deepEqual(await downloadCatalogSource(document), {
    content,
    contentType: "application/pdf",
  });
  assert.equal(request.mock.callCount(), 3);
});

test("does not retry unavailable documents or silently replace a changed revision", async () => {
  const request = mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  await assert.rejects(downloadCatalogSource(document), /HTTP 404/);
  assert.equal(request.mock.callCount(), 1);
  request.mock.mockImplementation(async () => new Response("changed document"));
  await assert.rejects(downloadCatalogSource(document), /contenuto diverso/);
  assert.equal(request.mock.callCount(), 2);
});

test("verifies official JSON source records against their pinned digest", async () => {
  const data = Buffer.from('{"revision":"3010340-001"}');
  const document = {
    sourceUrl: "https://manufacturer.example/api/articles/3010340",
    sha256: createHash("sha256").update(data).digest("hex"),
  };
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(data, { headers: { "Content-Type": "application/json" } }),
  );
  assert.deepEqual(await downloadCatalogSource(document), {
    content: data,
    contentType: "application/json",
  });
});

test("accepts uppercase hexadecimal SHA-256 metadata", async () => {
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(content, { headers: { "Content-Type": "application/pdf" } }),
  );
  assert.deepEqual(
    await downloadCatalogSource({
      ...document,
      sha256: document.sha256.toUpperCase(),
    }),
    { content, contentType: "application/pdf" },
  );
});

test("stops after three transient failures", async () => {
  const request = mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(null, { status: 502, headers: { "Retry-After": "0" } }),
  );
  await assert.rejects(downloadCatalogSource(document), /HTTP 502/);
  assert.equal(request.mock.callCount(), 3);
});

test("rejects local file URLs before downloading", async () => {
  const request = mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected request");
  });
  await assert.rejects(
    downloadCatalogSource({ ...document, sourceUrl: "file:///catalog.pdf" }),
    /protocollo/,
  );
  assert.equal(request.mock.callCount(), 0);
});
