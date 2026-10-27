import type { Project } from "@/schemas/project";
import { buildDossier } from "@/services/pdf/dossier";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { easyfattWorkbook } from "./ecoclima-easyfatt";
import type { EasyfattMappings } from "@/domain/catalogs/easyfatt-mapping";
import { easyfattArticleKey } from "@/domain/catalogs/easyfatt-mapping";

function materialsEasyfattRows(
  project: Project,
  mappings: EasyfattMappings = {},
) {
  const dossier = buildDossier(project);
  const prices = new Map<string, number | null>();
  for (const line of calculateEcoclimaBom(dossier.project).lines) {
    if (!line.sku || line.unitPriceCents === null) continue;
    prices.set(
      line.sku,
      prices.has(line.sku) && prices.get(line.sku) !== line.unitPriceCents
        ? null
        : line.unitPriceCents,
    );
  }
  const materials = [...dossier.materials, ...dossier.accessories];
  const rooms = new Map<
    string,
    Map<
      string,
      {
        cells: (string | number | null)[];
        reason: string;
        supplierCode?: string;
        supplier?: string;
      }
    >
  >();
  for (const row of materials)
    for (const allocation of row.roomQuantities) {
      const mapping =
        mappings[easyfattArticleKey(row)] ?? mappings[row.mappingKey];
      const code = mapping?.code || undefined;
      const supplierCode = mapping?.supplierCode || row.sku;
      const supplier = mapping?.supplier || (row.sku && !mapping?.supplierCode ? "Ecoclima" : "");
      const price = mapping
        ? undefined
        : row.sku
          ? prices.get(row.sku)
          : undefined;
      const quantity = mapping
        ? (mapping.quantity === "pieces"
            ? allocation.pieces
            : allocation.quantity) * mapping.multiplier
        : allocation.quantity;
      const group = rooms.get(allocation.room) ?? new Map();
      const push = row.details.includes("Chiusura PUSH");
      const identity = `${row.mappingKey}|${code ?? row.description}|${row.unit}|${row.dimensions ?? ""}|${price ?? ""}|${push}`;
      const existing = group.get(identity);
      if (existing) existing.cells[2] = Number(existing.cells[2]) + quantity;
      else
        group.set(identity, {
          cells: [
            code ?? null,
            (code
              ? row.description
              : `${row.description}; ${row.unit}${row.dimensions ? `; ${row.dimensions}` : ""}`) +
              (push ? "; Chiusura PUSH al posto della vite" : ""),
            quantity,
            price == null ? null : price / 100,
            supplierCode ?? null,
          ],
          reason: [
            !code ? "Codice gestionale da associare" : "",
            price == null
              ? mapping
                ? "Prezzo da recuperare in Easyfatt"
                : "Prezzo da quotare"
              : "",
          ]
            .filter(Boolean)
            .join("; "),
          supplierCode,
          supplier,
        });
      rooms.set(allocation.room, group);
    }
  const rows: {
    cells: (string | number | null)[];
    reason: string;
    supplierCode?: string;
    supplier?: string;
  }[] = [];
  for (const [room, entries] of rooms) {
    rows.push({ cells: [null, `STANZA: ${room}`, null, null], reason: "" });
    rows.push(...entries.values());
  }
  return rows;
}

/** Document rows for Easyfatt; absent order codes and prices stay empty. */
export function materialsEasyfattXlsx(
  project: Project,
  mappings: EasyfattMappings = {},
): Uint8Array<ArrayBuffer> {
  const rows = materialsEasyfattRows(project, mappings);
  const header = ["Cod.", "Descrizione", "Q.tà", "Prezzo", "Codice fornitore"];
  const sheets = [
    {
      name: "Righe preventivo",
      rows: [header, ...rows.map((row) => row.cells)],
    },
  ];
  const pending = rows.filter((row) => row.reason);
  if (pending.length)
    sheets.push({
      name: "Da completare",
      rows: [
        [...header, "Motivo"],
        ...pending.map((row) => [...row.cells, row.reason]),
      ],
    });
  const codedRows = rows.filter((row) =>
    row.reason.includes("Prezzo da recuperare in Easyfatt"),
  );
  if (codedRows.length)
    sheets.push({
      name: "Codici Easyfatt",
      rows: [
        ["Cod.", "Q.tà"],
        ...codedRows.map((row) => [row.cells[0], row.cells[2]]),
      ],
    });
  const supplierRows = rows.filter((row) => row.supplierCode);
  if (supplierRows.length)
    sheets.push({
      name: "Codici fornitori",
      rows: [
        ["Cod. prodotto fornitore", "Q.tà", "Fornitore", "Descrizione"],
        ...supplierRows.map((row) => [row.supplierCode!, row.cells[2], row.supplier || null, row.cells[1]]),
      ],
    });
  return easyfattWorkbook(sheets);
}

const xmlText = (value: string) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Easyfatt-XML creates a new quote; missing prices must be checked in Easyfatt. */
export function materialsEasyfattXml(project: Project, mappings: EasyfattMappings, customer: string, date: string, customerCode = ""): string {
  if (!customer.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Indica cliente e data del preventivo.");
  const rows = materialsEasyfattRows(project, mappings).map(({ cells, supplierCode }) => {
    const [code, description, quantity, price] = cells;
    const decimal = (value: number | string) => Number(value).toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 21 });
    return `<Row>${code ? `<Code>${xmlText(String(code))}</Code>` : ""}${supplierCode ? `<SupplierCode>${xmlText(supplierCode)}</SupplierCode>` : ""}<Description>${xmlText(String(description))}</Description>${quantity === null ? "" : `<Qty>${decimal(quantity)}</Qty>`}${price === null ? "" : `<Price>${decimal(price)}</Price>`}</Row>`;
  }).join("\n");
  // Total is required by Danea's XSD but explicitly ignored on import.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<EasyfattDocuments AppVersion="2" Creator="Staiano HVAC"><Documents><Document><DocumentType>Q</DocumentType><Date>${date}</Date><CustomerName>${xmlText(customer.trim())}</CustomerName>${customerCode.trim() ? `<CustomerCode>${xmlText(customerCode.trim())}</CustomerCode>` : ""}<Total>0</Total><Rows>\n${rows}\n</Rows></Document></Documents></EasyfattDocuments>`;
}
