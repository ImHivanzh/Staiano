import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { scanPantum, ScannerError } from "@/services/import/pantum-server";

vi.mock("@/services/import/pantum-server", async (original) => ({
  ...(await original<typeof import("@/services/import/pantum-server")>()),
  scanPantum: vi.fn(),
}));

function request(
  body: unknown = { dpi: 150, sorgente: "adf" },
  origin = "http://localhost:3015",
) {
  const text = JSON.stringify(body);
  return new Request("http://localhost:3015/api/import/scan", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(text)),
    },
    body: text,
  });
}

afterEach(() => vi.resetAllMocks());

it("rejects foreign origins and invalid parameters before contacting the scanner", async () => {
  expect((await POST(request(undefined, "https://external.test"))).status).toBe(
    403,
  );
  for (const body of [
    { dpi: 600, sorgente: "adf" },
    { dpi: 150, sorgente: "usb" },
    { dpi: 150, sorgente: "adf", host: "external.test" },
    null,
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(scanPantum).not.toHaveBeenCalled();
});

it("acquires directly through the local bridge and returns the PDF", async () => {
  const pdf = Buffer.from("%PDF-1.7\nscan");
  vi.mocked(scanPantum).mockResolvedValue(pdf);
  const response = await POST(request({ dpi: 300, sorgente: "piano" }));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(pdf.toString());
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(scanPantum).toHaveBeenCalledWith(300, "piano");
});

it("preserves busy, empty tray, missing runtime and timeout errors", async () => {
  for (const [message, status] of [
    ["Scanner occupato", 409],
    ["Vassoio vuoto", 502],
    ["Python assente", 503],
    ["Timeout scanner", 504],
  ] as const) {
    vi.mocked(scanPantum).mockRejectedValueOnce(
      new ScannerError(message, status),
    );
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ message });
  }
});
