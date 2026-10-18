import { strToU8, zipSync } from "three/addons/libs/fflate.module.js";
import type {
  EcoclimaBom,
  EcoclimaBomLine,
} from "@/domain/air-terminals/commercial-bom";

export const easyfattLineReady = (line: EcoclimaBomLine) =>
  line.status === "known" &&
  !!line.sku &&
  line.quantity !== null &&
  Number.isFinite(line.quantity) &&
  line.quantity > 0 &&
  line.unitPriceCents !== null &&
  Number.isSafeInteger(line.unitPriceCents) &&
  line.unitPriceCents >= 0;

const xml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** Actual XLSX: text stays text (including SKUs), quantities and prices stay numeric. */
export function ecoclimaEasyfattXlsx(
  bill: EcoclimaBom,
): Uint8Array<ArrayBuffer> {
  const ready = bill.lines.filter(easyfattLineReady);
  const pending = bill.lines.filter((line) => !easyfattLineReady(line));
  const sheets: { name: string; rows: (string | number | null)[][] }[] = [
    {
      name: "Righe preventivo",
      rows: [
        ["Cod.", "Descrizione", "Q.tà", "Prezzo"],
        ...ready.map((line) => [
          line.sku,
          line.label,
          line.quantity,
          line.unitPriceCents! / 100,
        ]),
      ],
    },
  ];
  if (pending.length)
    sheets.push({
      name: "Da completare",
      rows: [
        ["Codice", "Descrizione", "Quantità", "Prezzo EUR", "Motivo"],
        ...pending.map((line) => [
          line.sku,
          line.label,
          line.quantity,
          line.unitPriceCents === null ? null : line.unitPriceCents / 100,
          line.reason ??
            "Voce non verificata: completare prima dell’importazione.",
        ]),
      ],
    });
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rels = "http://schemas.openxmlformats.org/package/2006/relationships";
  const office =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<workbook xmlns="${ns}" xmlns:r="${office}"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships xmlns="${rels}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${office}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `<styleSheet xmlns="${ns}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
  };
  sheets.forEach((sheet, index) => {
    const rows = sheet.rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((value, c) => {
              const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
              if (value === null) return `<c r="${ref}"/>`;
              if (typeof value === "number")
                return `<c r="${ref}"${c === 3 ? ' s="1"' : ""}><v>${value}</v></c>`;
              return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      `<worksheet xmlns="${ns}"><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="65" customWidth="1"/><col min="3" max="4" width="16" customWidth="1"/><col min="5" max="5" width="80" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  return new Uint8Array(zipSync(files));
}
