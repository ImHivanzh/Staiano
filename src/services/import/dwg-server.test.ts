import { expect, it } from "vitest";
import {
  boundedDwgBody,
  localDwgRequestAllowed,
  validDwgSignature,
  MAX_DWG_BYTES,
  dwgConverterStatus,
  convertDwg,
} from "./dwg-server";

it("never starts commercial ODA conversion without administrator licence confirmation", async () => {
  const previous = process.env.ODA_COMMERCIAL_USE_CONFIRMED;
  const previousEngine = process.env.DWG_IMPORT_ENGINE;
  process.env.DWG_IMPORT_ENGINE = "oda";
  delete process.env.ODA_COMMERCIAL_USE_CONFIRMED;
  try {
    const status = await dwgConverterStatus();
    expect(status.available).toBe(false);
    expect(status.licensed).toBe(false);
    const file = Buffer.alloc(100);
    file.write("AC1032");
    await expect(convertDwg(file)).rejects.toThrow(/licenza aziendale/);
  } finally {
    if (previousEngine === undefined) delete process.env.DWG_IMPORT_ENGINE;
    else process.env.DWG_IMPORT_ENGINE = previousEngine;
    if (previous === undefined) delete process.env.ODA_COMMERCIAL_USE_CONFIRMED;
    else process.env.ODA_COMMERCIAL_USE_CONFIRMED = previous;
  }
});

it("accepts only local same-origin conversion requests", () => {
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: { "x-forwarded-host": "localhost:99999" },
      }),
    ),
  ).toBe(false);
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: {
          "x-forwarded-host": "hvac.internal.staianopoint.com",
          origin: "https://hvac.internal.staianopoint.com",
        },
      }),
    ),
  ).toBe(true);
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: {
          "x-forwarded-host": "external.test",
          origin: "https://external.test",
        },
      }),
    ),
  ).toBe(false);
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: {
          "x-forwarded-host": "hvac.internal.staianopoint.com",
          origin: "https://external.test",
        },
      }),
    ),
  ).toBe(false);
  expect(
    localDwgRequestAllowed(
      new Request("https://hvac.internal.staianopoint.com/api/import/dwg", {
        headers: { origin: "https://hvac.internal.staianopoint.com" },
      }),
    ),
  ).toBe(true);
  expect(
    localDwgRequestAllowed(
      new Request("https://hvac.internal.staianopoint.com/api/import/dwg", {
        headers: { origin: "https://external.test" },
      }),
    ),
  ).toBe(false);
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: { origin: "http://127.0.0.1:3015" },
      }),
    ),
  ).toBe(true);
  expect(
    localDwgRequestAllowed(
      new Request("http://127.0.0.1:3015/api/import/dwg", {
        headers: { origin: "https://external.test" },
      }),
    ),
  ).toBe(false);
  expect(
    localDwgRequestAllowed(new Request("https://public.test/api/import/dwg")),
  ).toBe(false);
});

it("validates DWG header and rejects truncated or unrelated files", () => {
  const dwg = Buffer.alloc(100);
  dwg.write("AC1032");
  expect(validDwgSignature(dwg)).toBe(true);
  expect(validDwgSignature(Buffer.from("AC1032"))).toBe(false);
  expect(validDwgSignature(Buffer.from("not-dwg"))).toBe(false);
});

it("enforces MIME and bounded request streams independent of declared size", async () => {
  const request = (body: BodyInit, type = "application/octet-stream") =>
    new Request("http://127.0.0.1:3015/api/import/dwg", {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  expect(await boundedDwgBody(request(new Uint8Array([1, 2, 3])))).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  await expect(boundedDwgBody(request("data", "text/plain"))).rejects.toThrow(
    /Tipo file/,
  );
  await expect(
    boundedDwgBody(request(new Uint8Array(MAX_DWG_BYTES + 1))),
  ).rejects.toThrow(/troppo grande/);
});
