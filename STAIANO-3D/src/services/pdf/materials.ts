import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Project } from "@/schemas/project";
import { buildDossier, type MaterialRow } from "./dossier";

const safe = (value: string) =>
  value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\r?\n/g, " / ")
    .replace(/[—–]/g, "-")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff\u20ac]/g, "?");
const number = (value: number) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
const quantity = (
  row: Pick<MaterialRow, "quantity" | "unit" | "pieces" | "pieceUnit">,
) =>
  `${number(row.quantity)} ${row.unit}${row.pieces > 1 && row.pieceUnit ? ` (${number(row.pieces)} ${row.pieceUnit})` : ""}`;

export async function renderMaterialsPdf(
  project: Project,
): Promise<Uint8Array> {
  const dossier = buildDossier(project);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28,
    pageHeight = 841.89,
    margin = 32,
    widths = [220, 72, 90, 149],
    top = 42;
  const groups = new Map<
    string,
    { row: MaterialRow; quantity: number; pieces: number; codes: string[] }[]
  >();
  for (const row of [...dossier.materials, ...dossier.accessories])
    for (const allocation of row.roomQuantities) {
      const items = groups.get(allocation.room) ?? [];
      items.push({
        row,
        quantity: allocation.quantity,
        pieces: allocation.pieces,
        codes: allocation.codes,
      });
      groups.set(allocation.room, items);
    }

  let pageNumber = 0;
  const addPage = (room: string, continued = false) => {
    const page = doc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    page.drawText(safe(dossier.project.name), {
      x: margin,
      y: pageHeight - top,
      size: 15,
      font: bold,
      color: rgb(0.09, 0.2, 0.29),
    });
    page.drawText(
      `Distinta materiali · ${safe(room)}${continued ? " (continua)" : ""}`,
      {
        x: margin,
        y: pageHeight - top - 24,
        size: 10,
        font: bold,
        color: rgb(0.21, 0.35, 0.66),
      },
    );
    const labels = [
      "Materiale / codici",
      "Quantità",
      "Dimensioni",
      "Caratteristiche",
    ];
    let x = margin;
    for (let i = 0; i < labels.length; i++) {
      page.drawText(labels[i], {
        x: x + 5,
        y: pageHeight - top - 48,
        size: 7.5,
        font: bold,
        color: rgb(0.09, 0.2, 0.29),
      });
      x += widths[i];
    }
    page.drawLine({
      start: { x: margin, y: pageHeight - top - 54 },
      end: { x: pageWidth - margin, y: pageHeight - top - 54 },
      thickness: 0.8,
      color: rgb(0.73, 0.78, 0.84),
    });
    return { page, y: pageHeight - top - 68 };
  };
  const wrap = (value: string, width: number, size: number) => {
    const words = safe(value).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  const roomOrder = new Map(
    dossier.project.rooms.map((room, index) => [room.name, index]),
  );
  const orderedGroups = [...groups].sort(
    ([a], [b]) =>
      (roomOrder.get(a) ?? Infinity) - (roomOrder.get(b) ?? Infinity),
  );
  for (const [room, rows] of orderedGroups) {
    let state = addPage(room);
    for (const entry of rows) {
      const cells = [
        `${entry.row.description}${entry.row.sku ? `\nCodice articolo: ${entry.row.sku}` : ""}\nRif. progetto: ${entry.codes.join(", ")}`,
        quantity({
          ...entry.row,
          quantity: entry.quantity,
          pieces: entry.pieces,
        }),
        entry.row.dimensions ?? "-",
        entry.row.details || "-",
      ];
      const wrapped = cells.map((cell, index) =>
        cell.split("\n").flatMap((line) => wrap(line, widths[index] - 10, 7)),
      );
      const height = Math.max(...wrapped.map((lines) => lines.length)) * 10 + 8;
      if (state.y - height < margin + 18) state = addPage(room, true);
      let x = margin;
      wrapped.forEach((lines, index) => {
        lines.forEach((line, lineIndex) =>
          state.page.drawText(line, {
            x: x + 5,
            y: state.y - 9 - lineIndex * 10,
            size: 7,
            font: index === 0 ? bold : font,
            color: rgb(0.12, 0.19, 0.26),
          }),
        );
        x += widths[index];
      });
      state.page.drawLine({
        start: { x: margin, y: state.y - height },
        end: { x: pageWidth - margin, y: state.y - height },
        thickness: 0.35,
        color: rgb(0.88, 0.9, 0.93),
      });
      state.y -= height;
    }
  }
  if (!pageNumber) {
    const { page } = addPage("Nessun materiale");
    page.drawText("La distinta non contiene materiali.", {
      x: margin,
      y: pageHeight - top - 78,
      size: 9,
      font,
    });
  }
  doc.setTitle(`Distinta materiali - ${safe(dossier.project.name)}`);
  doc.setAuthor("Termoidraulica Staiano");
  return doc.save();
}
