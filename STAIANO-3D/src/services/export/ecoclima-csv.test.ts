import { expect, it } from "vitest";
import type { EcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { ecoclimaBomCsv } from "./ecoclima-csv";

const bill: EcoclimaBom = {
  catalogVersion: "source-v1",
  revision: "15-2026",
  currency: "EUR",
  taxTreatment: "not-specified-by-source",
  complete: false,
  missingLineCount: 1,
  knownSubtotalCents: 12345,
  totalCents: null,
  lines: [
    {
      id: "line-1",
      terminalIds: ["terminal"],
      systemId: "system",
      familyCode: "EDLS",
      kind: "terminal",
      label: 'Bocchetta "bianca"; quantità',
      dimensions: "L 595 × H 24 × P 595 mm",
      sku: "EDLS20",
      quantity: 1.5,
      unitPriceCents: 8230,
      extendedPriceCents: 12345,
      currency: "EUR",
      status: "known",
      reason: null,
      sourceMetadata: null,
      quantitySourceMetadata: null,
    },
    {
      id: "line-2",
      terminalIds: [],
      systemId: "system",
      familyCode: "EDLS",
      kind: "machine-plenum",
      label: "Plenum su misura",
      dimensions: null,
      sku: null,
      quantity: null,
      unitPriceCents: null,
      extendedPriceCents: null,
      currency: "EUR",
      status: "unknown",
      reason: "Da quotare\nsu disegno",
      sourceMetadata: null,
      quantitySourceMetadata: null,
    },
  ],
};

it("exports Italian Excel CSV without replacing missing prices or quantities with zero", () => {
  const text = ecoclimaBomCsv(bill);
  expect(text.startsWith('\uFEFF"Codice";"Articolo";"Quantità"')).toBe(true);
  expect(text).toContain(
    '"Bocchetta ""bianca""; quantità";"1,5";"82,30";"123,45"',
  );
  expect(text).toContain(
    '"Da verificare";"Plenum su misura";"Da verificare";"Da quotare";"Da completare"',
  );
  expect(text).toContain('"Da quotare\nsu disegno"');
  expect(text.endsWith("\r\n")).toBe(true);
  expect(text).toContain('"IVA"');
  expect(text).toContain('"Da confermare sulla fonte"');
});

it("neutralizes spreadsheet formulas in text cells", () => {
  for (const label of [
    "=1+1",
    "+SUM(A1)",
    "-1+1",
    "@SUM(A1)",
    "\t=1+1",
    "  =1+1",
  ]) {
    expect(
      ecoclimaBomCsv({ ...bill, lines: [{ ...bill.lines[0], label }] }),
    ).toContain(`"'${label}"`);
  }
});
