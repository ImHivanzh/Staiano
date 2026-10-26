import type { Project } from "@/schemas/project";
import { buildDossier } from "@/services/pdf/dossier";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { easyfattWorkbook } from "./ecoclima-easyfatt";

/** Document rows for Easyfatt; absent order codes and prices stay empty. */
export function materialsEasyfattXlsx(
  project: Project,
): Uint8Array<ArrayBuffer> {
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
    Map<string, { cells: (string | number | null)[]; reason: string }>
  >();
  for (const row of materials)
    for (const allocation of row.roomQuantities) {
      const price = row.sku ? prices.get(row.sku) : undefined;
      const group = rooms.get(allocation.room) ?? new Map();
      const push = row.details.includes("Chiusura PUSH");
      const identity = `${row.sku ?? row.description}|${row.unit}|${row.dimensions ?? ""}|${price ?? ""}|${push}`;
      const existing = group.get(identity);
      if (existing)
        existing.cells[2] = Number(existing.cells[2]) + allocation.quantity;
      else
        group.set(identity, {
          cells: [
            row.sku ?? null,
            (row.sku
              ? row.description
              : `${row.description}; ${row.unit}${row.dimensions ? `; ${row.dimensions}` : ""}`) +
              (push ? "; Chiusura PUSH al posto della vite" : ""),
            allocation.quantity,
            price == null ? null : price / 100,
          ],
          reason: [
            !row.sku ? "Codice articolo da verificare" : "",
            price == null ? "Prezzo da quotare" : "",
          ]
            .filter(Boolean)
            .join("; "),
        });
      rooms.set(allocation.room, group);
    }
  const rows: { cells: (string | number | null)[]; reason: string }[] = [];
  for (const [room, entries] of rooms) {
    rows.push({ cells: [null, `STANZA: ${room}`, null, null], reason: "" });
    rows.push(...entries.values());
  }
  const header = ["Cod.", "Descrizione", "Q.tà", "Prezzo"];
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
  return easyfattWorkbook(sheets);
}
