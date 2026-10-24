import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { buildInfo, licenseSetup, licenseStatus } from "@/server/license";
import { GET } from "./route";

vi.mock("@/server/license", () => ({
  buildInfo: vi.fn(),
  licenseSetup: vi.fn(),
  licenseStatus: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(buildInfo).mockReturnValue({
    buildId: "test-build",
    commit: "a".repeat(40),
    packaged: true,
  });
  vi.mocked(licenseSetup).mockResolvedValue({
    enforced: true,
    serverUrl: "https://licenses.example",
    publicKey: true,
    machineId: "test-machine",
    filePath: "C:\\Staiano d'ufficio\\data\\.cache\\license.json",
    filePresent: true,
    toleranceMinutes: 30,
    checkMinutes: 10,
  });
  vi.mocked(licenseStatus).mockResolvedValue({
    ok: false,
    state: "update-required",
    enforce: true,
    machineId: "test-machine",
    serverUrl: "https://licenses.example",
    licenseId: "license-id",
    customer: "Cliente",
    plan: "standard",
    expiresAt: null,
    notBefore: null,
    lastVerifiedAt: null,
    activatedAt: null,
    message: "Aggiornamento obbligatorio",
  });
});

const page = (query = "") =>
  GET(new NextRequest(`http://localhost:3015/licenza${query}`));

it("mostra il comando EXE per il percorso reale senza chiedere una nuova attivazione", async () => {
  const response = await page();
  const html = await response.text();
  expect(html).toContain('id="license-title">Aggiorna Staiano HVAC</h1>');
  expect(html).toContain("anche senza l’attività «Staiano HVAC Update»");
  expect(html).toContain(
    "Get-Content -LiteralPath &#39;C:\\Staiano d&#39;&#39;ufficio\\active.json&#39;",
  );
  expect(html).toContain(
    "&amp; $versione.executable --update --data-dir &#39;C:\\Staiano d&#39;&#39;ufficio\\data&#39;",
  );
  expect(html).not.toContain('name="licenseKey"');
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "default-src 'none'",
  );
});

it("mantiene visibile il recupero per aggiornamento anche con un vecchio esito in query", async () => {
  const html = await (await page("?ok=1&state=missing")).text();
  expect(html).toContain("La licenza rimane attiva.");
  expect(html).not.toContain("Richiesta inviata");
  expect(html).not.toContain('name="licenseKey"');
});

it("per il server sorgente spiega dove aggiornare senza proporre comandi EXE", async () => {
  vi.mocked(buildInfo).mockReturnValue({
    buildId: "development",
    commit: "",
    packaged: false,
  });
  const html = await (await page()).text();
  expect(html).toContain("aggiornare e riavviare il server Staiano");
  expect(html).not.toContain("Get-Content");
  expect(html).not.toContain('name="licenseKey"');
});

it("conserva l’attivazione della licenza mancante e ignora lo stato richiesto per la procedura", async () => {
  const status = await licenseStatus();
  vi.mocked(licenseStatus).mockResolvedValue({
    ...status,
    state: "missing",
    message: "Nessuna licenza attiva su questa postazione.",
  });
  const html = await (await page("?state=update-required")).text();
  expect(html).toContain('id="license-title">Attivazione licenza</h1>');
  expect(html).toContain('name="licenseKey"');
  expect(html).not.toContain("Aggiornamento obbligatorio");
  expect(html).not.toContain("Get-Content");
});

it("con una licenza attiva apre il configuratore anche da un vecchio link di blocco", async () => {
  const status = await licenseStatus();
  vi.mocked(licenseStatus).mockResolvedValue({
    ...status,
    ok: true,
    state: "active",
  });
  const html = await (await page("?state=update-required")).text();
  expect(html).toContain("Apri il configuratore");
  expect(html).not.toContain("Aggiornamento obbligatorio");
  expect(html).not.toContain('name="licenseKey"');
});
