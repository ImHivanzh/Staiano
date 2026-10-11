import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import type {
  EcoclimaBom,
  EcoclimaBomLine,
} from "@/domain/air-terminals/commercial-bom";
import { ecoclimaEasyfattXlsx, easyfattLineReady } from "./ecoclima-easyfatt";

const line: EcoclimaBomLine = {
  id: "1",
  terminalIds: [],
  systemId: null,
  familyCode: "EDLS",
  kind: "terminal",
  label: 'Bocchetta <bianca> & "acciaio"',
  sku: "00123",
  quantity: 1.5,
  unitPriceCents: 8230,
  extendedPriceCents: 12345,
  currency: "EUR",
  status: "known",
  reason: null,
  sourceMetadata: null,
  quantitySourceMetadata: null,
};
const bill: EcoclimaBom = {
  catalogVersion: "v1",
  revision: "2026",
  currency: "EUR",
  taxTreatment: "not-specified-by-source",
  knownSubtotalCents: 12345,
  totalCents: null,
  complete: false,
  missingLineCount: 1,
  lines: [
    line,
    {
      ...line,
      id: "2",
      sku: null,
      quantity: null,
      unitPriceCents: null,
      extendedPriceCents: null,
      status: "unknown",
      reason: "Da quotare",
    },
  ],
};

it("writes a real Excel workbook with numeric money and quantities, preserving text SKUs", () => {
  const data = ecoclimaEasyfattXlsx(bill);
  expect([...data.slice(0, 2)]).toEqual([80, 75]);
  const files = unzipSync(data);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain(
    '<c r="A2" t="inlineStr"><is><t xml:space="preserve">00123</t>',
  );
  expect(sheet).toContain('<c r="C2"><v>1.5</v></c>');
  expect(sheet).toContain('<c r="D2" s="1"><v>82.3</v></c>');
  expect(sheet).toContain("Bocchetta &lt;bianca&gt; &amp; &quot;acciaio&quot;");
  expect(sheet.match(/<row /g)).toHaveLength(2);
  expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Da completare"');
  const pending = strFromU8(files["xl/worksheets/sheet2.xml"]);
  expect(pending).toContain("Da quotare");
  expect(pending).toContain('<c r="D2"/>');
  expect(sheet).not.toContain("Totale");
});

it("keeps formulas as plain strings and does not invent zero amounts for missing prices", () => {
  const files = unzipSync(
    ecoclimaEasyfattXlsx({
      ...bill,
      lines: [{ ...line, label: "=1+1", unitPriceCents: 0 }],
    }),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
  expect(sheet).not.toContain("<f>");
  expect(sheet).toContain('<c r="D2" s="1"><v>0</v></c>');
  expect(files["xl/worksheets/sheet2.xml"]).toBeUndefined();
  for (const quantity of [null, 0, -1, Infinity, NaN])
    expect(easyfattLineReady({ ...line, quantity })).toBe(false);
  expect(easyfattLineReady({ ...line, unitPriceCents: null })).toBe(false);
  expect(easyfattLineReady({ ...line, status: "unknown" })).toBe(false);
});
