import {
  PDFDocument,
  StandardFonts,
  rgb as pdfRgb,
  type PDFPage,
  type PDFFont,
  PDFString,
} from "pdf-lib";
import QRCode from "qrcode";
import { dossierGuideLink } from "./dossier-guide";
import type { Project, Point } from "@/schemas/project";
import { buildDossier, TECHNICAL_NOTE } from "./dossier";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import { machineLoadDivisor } from "@/domain/ducted/machine";
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import {
  calculatePlenum,
  calculateSupplyPlenum,
  PLENUM_SOURCES,
} from "@/domain/ducted/plenum";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";
import { vrvIndoorAtVersion, vrvOutdoorAtVersion } from "@/domain/catalogs/vrv";
import type { ProjectPanorama } from "@/services/render3d/export";
import { plenumTechnicalDrawing } from "@/domain/ducted/technical-view";
import {
  roomMeasuredSides,
  wallMeasuredLength,
} from "@/domain/geometry/dimensions";
import { ductLength, ductRoute } from "@/domain/ducted/routes";
import { placedPlenumGeometry } from "@/domain/ducted/placement";
import {
  fanCoilMaximumPoint,
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
  controllerBoardFor,
} from "@/domain/catalogs/fan-coils";
import {
  heatPumpProductAtVersion,
  heatPumpCapacity,
} from "@/domain/catalogs/heat-pumps";
import { wattsToBtuh } from "@/domain/thermal/calculate";
import { roomLabelPoint } from "@/domain/geometry/room-label";

export type DossierRenderOptions = {
  variant?: "complete" | "summary";
  monochrome?: boolean;
  includePrices?: boolean;
  logoSvg?: string;
  generatedAt?: Date;
  renderImages?: readonly ProjectPanorama[];
};

const n = (v: number, decimals = 2) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimals }).format(v);
// Le quantita restano leggibili: unita al singolare e pezzi raggruppati a parte.
const singular: Record<string, string> = {
    batterie: "batteria",
    elementi: "elemento",
    pezzi: "pezzo",
    sistemi: "sistema",
  },
  unitLabel = (count: number, unit: string) =>
    count === 1 ? (singular[unit] ?? unit) : unit,
  quantityText = (row: {
    quantity: number;
    unit: string;
    pieces: number;
    pieceUnit?: string;
  }) =>
    `${n(row.quantity, 0)} ${unitLabel(row.quantity, row.unit)}${
      row.pieces > 1 && row.pieceUnit
        ? ` (${n(row.pieces, 0)} ${unitLabel(row.pieces, row.pieceUnit)})`
        : ""
    }`;
// Helvetica is WinAnsi. Keep technical notation readable and user names safe.
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\r?\n/g, " / ")
    .replaceAll("ΔT", "DT")
    .replaceAll("≤", "<=")
    .replaceAll("≥", ">=")
    .replaceAll("→", "->")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff\u20ac]/g, "?");

export async function renderDossierPdf(
  project: Project,
  options: DossierRenderOptions = {},
): Promise<Uint8Array> {
  const data = buildDossier(project),
    p = data.project;
  const isSummary = options.variant === "summary";
  const rgb = (r: number, g: number, b: number) => {
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return options.monochrome ? pdfRgb(gray, gray, gray) : pdfRgb(r, g, b);
  };
  const navy = rgb(0.094, 0.196, 0.286),
    blue = rgb(0.212, 0.353, 0.659),
    cyan = rgb(0.412, 0.792, 0.98),
    green = rgb(0.184, 0.49, 0.235),
    amber = rgb(0.706, 0.325, 0.035),
    red = rgb(0.776, 0.157, 0.157),
    ink = navy,
    muted = rgb(0.318, 0.4, 0.475),
    faint = rgb(0.38, 0.459, 0.537),
    line = rgb(0.875, 0.902, 0.929),
    lineStrong = rgb(0.729, 0.784, 0.839),
    pale = rgb(0.941, 0.961, 0.98),
    paper2 = rgb(0.957, 0.969, 0.98),
    white = rgb(1, 1, 1),
    navText = options.monochrome ? ink : rgb(0.733, 0.812, 0.875),
    band = options.monochrome ? paper2 : navy,
    bandText = options.monochrome ? ink : white;
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const date = options.generatedAt ?? new Date();
  const guideUrl = await dossierGuideLink(
    data,
    options.variant ?? "complete",
    date,
  );
  const qr = QRCode.create(guideUrl, { errorCorrectionLevel: "M" });
  const variantLabel =
    options.variant === "summary" ? "Dossier sintetico" : "Dossier tecnico";
  doc.setTitle(
    `Dossier ${options.variant === "summary" ? "sintetico" : "tecnico"}${options.monochrome ? " - bianco e nero" : ""} - ${p.name}`,
  );
  doc.setAuthor("Termoidraulica Staiano");
  doc.setSubject("Configurazione HVAC e dimensionamento convenzionale");
  doc.setCreationDate(date);
  let page!: PDFPage,
    coverPage: PDFPage | null = null,
    sectionTitle = "",
    y = 0;
  const margin = 46,
    width = 595.28,
    height = 841.89,
    usable = width - margin * 2;
  const txt = (
    s: string,
    x: number,
    yy: number,
    size = 10,
    f: PDFFont = font,
    color = ink,
  ) => page.drawText(safe(s), { x, y: yy, size, font: f, color });
  const centered = (
    s: string,
    centerX: number,
    yy: number,
    size = 10,
    f: PDFFont = font,
    color = ink,
  ) =>
    txt(
      s,
      centerX - f.widthOfTextAtSize(safe(s), size) / 2,
      yy,
      size,
      f,
      color,
    );
  const wrap = (s: string, max: number, size: number, f = font) => {
    const lines: string[] = [];
    let line = "";
    for (const word of safe(s).split(/\s+/)) {
      if (f.widthOfTextAtSize((line ? line + " " : "") + word, size) <= max) {
        line += (line ? " " : "") + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      if (f.widthOfTextAtSize(word, size) <= max) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (f.widthOfTextAtSize(line + ch, size) > max) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const trackedWidth = (
    s: string,
    size: number,
    f: PDFFont,
    spacing: number,
  ) => {
    const gap = Math.min(spacing, 0.8);
    return [...safe(s)].reduce(
      (sum, ch, index) =>
        sum + f.widthOfTextAtSize(ch, size) + (index ? gap : 0),
      0,
    );
  };
  const tracked = (
    s: string,
    x: number,
    yy: number,
    size: number,
    f: PDFFont,
    color: ReturnType<typeof rgb>,
    spacing = 1.2,
  ) => {
    let cursor = x;
    // Oltre ~0,8pt l'estrazione testo separa le lettere: teniamo la spaziatura leggibile.
    const gap = Math.min(spacing, 0.8);
    for (const ch of [...safe(s)]) {
      txt(ch, cursor, yy, size, f, color);
      cursor += f.widthOfTextAtSize(ch, size) + gap;
    }
  };
  const statusTone = (value: string) => {
    const v = value.trim();
    if (
      /^(OK|sufficiente|verificata|verificato|documentato|entro criterio|conforme)$/i.test(
        v,
      )
    )
      return { color: green, strong: true };
    if (/^(DEFICIT)$/i.test(v)) return { color: red, strong: true };
    if (/^(AVVISO|WARNING)$/i.test(v)) return { color: amber, strong: true };
    if (/^(ERRORE|NON VALIDABILE)$/i.test(v))
      return { color: red, strong: true };
    if (
      /^(NON VERIFICATO|NON VERIFICATA|DA VERIFICARE|Da verificare|Da completare|Da quotare|oltre criterio|non pubblicato|n\.d\.|non scelto|non scelta|non collegato|proposto)$/.test(
        v,
      )
    )
      return { color: amber, strong: false };
    return null;
  };
  const continuationTitle = () =>
    `${sectionTitle.replace(/ - seguito$/, "") || "Dossier tecnico"} - seguito`;
  const newPage = (title: string) => {
    page = doc.addPage([width, height]);
    sectionTitle = title;
    tracked("STAIANO HVAC", margin, height - 37, 6.8, bold, blue, 1.1);
    tracked(
      variantLabel.toUpperCase(),
      width - margin - trackedWidth(variantLabel.toUpperCase(), 6.8, bold, 1.1),
      height - 37,
      6.8,
      bold,
      muted,
      1.1,
    );
    page.drawLine({
      start: { x: margin, y: height - 48 },
      end: { x: width - margin, y: height - 48 },
      color: line,
      thickness: 0.6,
    });
    y = height - 81;
    for (const line of wrap(title, usable, 19, bold)) {
      txt(line, margin, y, 19, bold, navy);
      y -= 23;
    }
    y -= 9;
  };
  const ensure = (needed: number, title = continuationTitle()) => {
    if (y - needed < 68) newPage(title);
  };
  const paragraph = (s: string, size = 9.5, color = ink) => {
    const lead = size * 1.5;
    for (const line of wrap(s, usable, size)) {
      ensure(lead + 2);
      txt(line, margin, y, size, font, color);
      y -= lead;
    }
    y -= 9;
  };
  const heading = (s: string) => {
    ensure(52);
    y -= 18;
    const lines = wrap(s, usable, 12.5, bold);
    lines.forEach((line, index) =>
      txt(line, margin, y - index * 15.5, 12.5, bold, navy),
    );
    y -= (lines.length - 1) * 15.5;
    const ruleY = y - 7;
    page.drawLine({
      start: { x: margin, y: ruleY },
      end: { x: width - margin, y: ruleY },
      color: line,
      thickness: 0.6,
    });
    page.drawLine({
      start: { x: margin, y: ruleY },
      end: { x: margin + 42, y: ruleY },
      color: cyan,
      thickness: 1.8,
    });
    y = ruleY - 17;
  };
  const table = (
    headers: string[],
    rows: string[][],
    fractions: number[],
    title?: string,
  ) => {
    const col = fractions.map((v) => v * usable),
      headerSize = 8.1,
      bodySize = 9,
      lead = 12.6,
      padding = 7,
      numeric = headers.map((_, index) => {
        const values = rows
            .map((row) => (row[index] ?? "").trim())
            .filter(Boolean),
          unit =
            "(?:m²|m³|m|mm|cm|kW|W|Pa|dB\\(A\\)|dB|h|%|K|kg|°C|EUR|BTU\\/h|m³\\/h)",
          token = `[+\\-−]?\\d[\\d.,]*(?:\\s*${unit})?`,
          pattern = new RegExp(`^${token}(?:\\s*\\/\\s*${token})?$`);
        return (
          values.some((v) => pattern.test(v)) &&
          values.every((v) => pattern.test(v) || statusTone(v))
        );
      }),
      drawHeader = (rowLines = 1, withTitle = false) => {
        const headerLines = headers.map((h, i) =>
          wrap(h, col[i] - padding * 2, headerSize, bold),
        );
        const hh =
          Math.max(...headerLines.map((lines) => lines.length)) * 11.5 +
          padding * 2;
        ensure(
          hh + rowLines * lead + padding * 2 + (withTitle && title ? 52 : 0),
        );
        if (withTitle && title) heading(title);
        page.drawRectangle({
          x: margin,
          y: y - hh,
          width: usable,
          height: hh,
          color: pale,
        });
        let x = margin;
        headerLines.forEach((lines, i) => {
          const ascent = bold.heightAtSize(headerSize, { descender: false });
          const descent = bold.heightAtSize(headerSize) - ascent;
          const baseline =
            y -
            hh / 2 +
            ((lines.length - 1) * 11.5) / 2 -
            (ascent - descent) / 2;
          lines.forEach((label, k) => {
            if (numeric[i])
              centered(
                label,
                x + col[i] / 2,
                baseline - k * 11.5,
                headerSize,
                bold,
                blue,
              );
            else
              txt(
                label,
                x + padding,
                baseline - k * 11.5,
                headerSize,
                bold,
                blue,
              );
          });
          x += col[i];
        });
        page.drawLine({
          start: { x: margin, y: y - hh },
          end: { x: margin + usable, y: y - hh },
          color: blue,
          thickness: 0.8,
        });
        y -= hh;
      };
    drawHeader(
      Math.min(
        40,
        Math.max(
          1,
          ...(rows[0]?.map(
            (text, index) =>
              wrap(text, col[index] - padding * 2, bodySize).length,
          ) ?? [1]),
        ),
      ),
      true,
    );
    rows.forEach((row, rowIndex) => {
      const lines = row.map((s, i) => wrap(s, col[i] - padding * 2, bodySize));
      const count = Math.max(...lines.map((l) => l.length));
      let offset = 0;
      while (offset < count) {
        let available = Math.floor((y - 70 - padding * 2) / lead);
        if (
          available < 1 ||
          (offset === 0 && count <= 40 && count > available)
        ) {
          newPage(continuationTitle());
          drawHeader(Math.min(40, count - offset));
          available = Math.floor((y - 70 - padding * 2) / lead);
        }
        const take = Math.min(count - offset, available),
          hh = take * lead + padding * 2;
        if (rowIndex % 2 === 1)
          page.drawRectangle({
            x: margin,
            y: y - hh,
            width: usable,
            height: hh,
            color: paper2,
          });
        let x = margin;
        lines.forEach((ll, i) => {
          const visible = ll.slice(offset, offset + take);
          visible.forEach((text, k) => {
            const tone = statusTone(text),
              f = tone?.strong ? bold : font,
              color = tone?.color ?? ink,
              drawX = numeric[i]
                ? x + (col[i] - f.widthOfTextAtSize(safe(text), bodySize)) / 2
                : x + padding,
              ascent = f.heightAtSize(bodySize, { descender: false }),
              descent = f.heightAtSize(bodySize) - ascent,
              baseline =
                y -
                hh / 2 +
                ((visible.length - 1) * lead) / 2 -
                (ascent - descent) / 2;
            txt(text, drawX, baseline - k * lead, bodySize, f, color);
          });
          x += col[i];
        });
        page.drawLine({
          start: { x: margin, y: y - hh },
          end: { x: margin + usable, y: y - hh },
          color: line,
          thickness: 0.4,
        });
        y -= hh;
        offset += take;
      }
    });
    y -= 16;
  };
  const notice = (
    title: string,
    body: string,
    tone: "warn" | "error" | "info" = "warn",
  ) => {
    const color = tone === "warn" ? amber : tone === "error" ? red : blue,
      background =
        tone === "warn"
          ? rgb(0.996, 0.965, 0.914)
          : tone === "error"
            ? rgb(0.996, 0.941, 0.941)
            : paper2,
      lines = wrap(body, usable - 30, 9),
      blockHeight = 36 + lines.length * 13.5;
    ensure(blockHeight + 14);
    page.drawRectangle({
      x: margin,
      y: y - blockHeight + 8,
      width: usable,
      height: blockHeight,
      color: background,
    });
    page.drawLine({
      start: { x: margin, y: y + 8 },
      end: { x: width - margin, y: y + 8 },
      color,
      thickness: 2,
    });
    txt(title, margin + 15, y - 12, 9.5, bold, color);
    lines.forEach((text, index) =>
      txt(text, margin + 15, y - 30 - index * 13.5, 9, font, ink),
    );
    y -= blockHeight + 14;
  };
  const statusStrip = (invalid: number, warnings: number) => {
    ensure(56);
    const items: [string, number, ReturnType<typeof rgb>][] = [
      ["Errori", invalid, invalid ? red : green],
      ["Avvisi", warnings, warnings ? amber : green],
      ["Verifiche", data.checks.length, blue],
    ];
    const top = y,
      cell = usable / items.length;
    items.forEach(([label, value, color], index) => {
      const x = margin + cell * index;
      if (index)
        page.drawLine({
          start: { x, y: top + 14 },
          end: { x, y: top - 28 },
          color: line,
          thickness: 0.5,
        });
      centered(String(value), x + cell / 2, top - 4, 17, bold, color);
      const caption = label.toUpperCase();
      tracked(
        caption,
        x + (cell - trackedWidth(caption, 6.6, bold, 1)) / 2,
        top - 23,
        6.6,
        bold,
        faint,
        1,
      );
    });
    y = top - 38;
  };
  const statRow = (items: [string, string][]) => {
    ensure(70);
    const top = y,
      cell = usable / items.length;
    page.drawLine({
      start: { x: margin, y: top + 16 },
      end: { x: width - margin, y: top + 16 },
      color: line,
      thickness: 0.6,
    });
    items.forEach(([label, value], index) => {
      const x = margin + cell * index;
      centered(value, x + cell / 2, top - 14, 16, bold, navy);
      const caption = label.toUpperCase();
      tracked(
        caption,
        x + (cell - trackedWidth(caption, 6.2, bold, 0.8)) / 2,
        top - 32,
        6.2,
        bold,
        faint,
        0.8,
      );
    });
    y = top - 52;
  };

  const drawTechnical = (
    drawing: NonNullable<ReturnType<typeof plenumTechnicalDrawing>>,
    blockHeight: number,
    machineName: string,
    frame = { x: margin, width: usable },
  ) => {
    const scale = Math.min(
      (frame.width - 24) / (drawing.bounds.maxX - drawing.bounds.minX),
      (blockHeight -
        (drawing.labels.some((label) => label.text === "MACCHINA") ? 32 : 18)) /
        (drawing.bounds.maxY - drawing.bounds.minY),
    );
    const map = (point: [number, number]): [number, number] => [
      frame.x +
        (frame.width - (drawing.bounds.maxX - drawing.bounds.minX) * scale) /
          2 +
        (point[0] - drawing.bounds.minX) * scale,
      y - blockHeight + 10 + (point[1] - drawing.bounds.minY) * scale,
    ];
    for (const polygon of drawing.polygons) {
      const points = polygon.points.map(map),
        first = points[0];
      if (!first) continue;
      const c = polygon.color;
      page.drawSvgPath(
        `M ${first[0]} ${-first[1]} ${points
          .slice(1)
          .map((point) => `L ${point[0]} ${-point[1]}`)
          .join(" ")} Z`,
        {
          color: rgb(
            parseInt(c.slice(1, 3), 16) / 255,
            parseInt(c.slice(3, 5), 16) / 255,
            parseInt(c.slice(5, 7), 16) / 255,
          ),
          borderColor: muted,
          borderWidth: 0.5,
        },
      );
    }
    for (const line of drawing.lines)
      for (let i = 1; i < line.length; i++) {
        const a = map(line[i - 1]),
          b = map(line[i]);
        page.drawLine({
          start: { x: a[0], y: a[1] },
          end: { x: b[0], y: b[1] },
          color: blue,
          thickness: 0.6,
        });
      }
    for (const label of drawing.labels) {
      const point = map(label.point),
        labels = wrap(
          label.text === "MACCHINA" ? machineName : label.text,
          Math.min(190, frame.width - 16),
          8,
          bold,
        ),
        labelWidth = Math.max(
          ...labels.map((text) => bold.widthOfTextAtSize(safe(text), 8)),
        ),
        centerX = Math.max(
          frame.x + labelWidth / 2 + 4,
          Math.min(frame.x + frame.width - labelWidth / 2 - 4, point[0]),
        );
      page.drawRectangle({
        x: centerX - labelWidth / 2 - 4,
        y: point[1] - 6 - (labels.length - 1) * 5.5,
        width: labelWidth + 8,
        height: labels.length * 11 + 2,
        color: rgb(1, 1, 1),
      });
      labels.forEach((text, index) =>
        centered(
          text,
          centerX,
          point[1] - 3 + (labels.length - 1) * 5.5 - index * 11,
          8,
          bold,
          ink,
        ),
      );
    }
    y -= blockHeight + 12;
  };
  const drawFloorPlans = () => {
    for (const floor of p.floors) {
      page = doc.addPage([1190.55, 841.89]);
      page.drawRectangle({
        x: 0,
        y: 841.89 - 22,
        width: 1190.55,
        height: 22,
        color: band,
      });
      tracked("STAIANO HVAC", 56, 841.89 - 15, 6.6, bold, bandText, 1.1);
      const a3Right = isSummary
        ? "DOSSIER SINTETICO · A3"
        : "DOSSIER TECNICO · A3";
      tracked(
        a3Right,
        1190.55 - 56 - trackedWidth(a3Right, 6.6, bold, 1.1),
        841.89 - 15,
        6.6,
        bold,
        navText,
        1.1,
      );
      txt(`Planimetria - ${floor.name}`, 56, 780, 20, bold, navy);
      txt(
        isSummary
          ? `Quota piano ${n(floor.elevationM)} m; quote interne utili e superfici nette`
          : `Quota piano ${n(floor.elevationM)} m; scala ${floor.scaleVerified ? "verificata" : "NON VERIFICATA"}; quote interne utili, superfici stanza al netto`,
        56,
        760,
        8.5,
        font,
        muted,
      );
      const walls = p.walls.filter((w) => w.floorId === floor.id),
        rooms = p.rooms.filter((r) => r.floorId === floor.id);
      const points = [
        ...walls.flatMap((w) => [w.start, w.end]),
        ...rooms.flatMap((r) => r.polygon),
        ...(p.hydronicSystems ?? [])
          .filter((system) => system.outdoorUnit.floorId === floor.id)
          .map((system) => system.outdoorUnit.position),
      ];
      if (!points.length) {
        doc.removePage(doc.getPageCount() - 1);
        continue;
      }
      const minX = Math.min(...points.map((v) => v.x)),
        maxX = Math.max(...points.map((v) => v.x)),
        minY = Math.min(...points.map((v) => v.y)),
        maxY = Math.max(...points.map((v) => v.y));
      const box = { x: 56, y: 155, w: 1078.55, h: 545 },
        ratio = Math.min(
          box.w / Math.max(maxX - minX + 1, 1),
          box.h / Math.max(maxY - minY + 1, 1),
        );
      const px = (v: Point) => ({
        x: box.x + box.w / 2 + (v.x - (minX + maxX) / 2) * ratio,
        y: box.y + box.h / 2 - (v.y - (minY + maxY) / 2) * ratio,
      });
      const polygon = (
        vertices: Point[],
        color: ReturnType<typeof rgb>,
        border?: ReturnType<typeof rgb>,
      ) => {
        const q = vertices.map(px);
        const path =
          q.map((v, i) => `${i ? "L" : "M"} ${v.x} ${841.89 - v.y}`).join(" ") +
          " Z";
        page.drawSvgPath(path, {
          x: 0,
          y: 841.89,
          color,
          borderColor: border,
          borderWidth: 0.8,
        });
      };
      rooms.forEach((r) => {
        polygon(
          r.polygon,
          !isSummary && r.geometryStatus === "unresolved"
            ? rgb(1, 0.9, 0.75)
            : pale,
        );
      });
      walls.forEach((w) => {
        const a = px(w.start),
          b = px(w.end);
        page.drawLine({
          start: a,
          end: b,
          thickness: Math.max(1.3, w.thickness * ratio),
          color: ink,
        });
      });
      for (const opening of p.openings.filter((o) => o.floorId === floor.id)) {
        const wall = walls.find((w) => w.id === opening.wallId);
        if (!wall) continue;
        const len = Math.hypot(
            wall.end.x - wall.start.x,
            wall.end.y - wall.start.y,
          ),
          t = (offset: number) =>
            px({
              x: wall.start.x + ((wall.end.x - wall.start.x) * offset) / len,
              y: wall.start.y + ((wall.end.y - wall.start.y) * offset) / len,
            });
        page.drawLine({
          start: t(opening.offsetM),
          end: t(Math.min(len, opening.offsetM + opening.widthM)),
          thickness: wall.thickness * ratio + 1,
          color: rgb(1, 1, 1),
        });
        page.drawLine({
          start: t(opening.offsetM),
          end: t(Math.min(len, opening.offsetM + opening.widthM)),
          thickness: 1,
          color: opening.type === "window" ? cyan : green,
        });
      }
      for (const duct of p.ducts ?? []) {
        if (
          !p.plenums.some(
            (pl) => pl.id === duct.plenumId && pl.floorId === floor.id,
          )
        )
          continue;
        const route = ductRoute(p, duct);
        for (let i = 1; i < route.length; i++)
          page.drawLine({
            start: px(route[i - 1]),
            end: px(route[i]),
            color: cyan,
            thickness: 1,
            dashArray: duct.decisionOrigin === "suggested" ? [4, 2] : undefined,
          });
      }
      const devices = [
        ...p.radiators.map((d) => ({ ...d, tint: blue })),
        ...p.airTerminals.map((d) => ({
          ...d,
          tint: d.use === "supply" ? cyan : green,
        })),
        ...p.hvacSystems.flatMap((s) =>
          s.fanCoilId
            ? []
            : s.indoorUnits.map((d) => ({
                ...d,
                tint: rgb(0.55, 0.32, 0.68),
              })),
        ),
        ...p.plenums.map((d) => ({ ...d, tint: rgb(0.3, 0.65, 0.72) })),
        ...(p.fanCoils ?? []).map((d) => ({
          ...d,
          tint: rgb(0.79, 0.45, 0.18),
        })),
        ...(p.hydronicSystems ?? []).map((system) => ({
          ...system.outdoorUnit,
          tint: rgb(0.45, 0.57, 0.3),
        })),
        ...(p.pillars ?? []).map((d) => ({ ...d, tint: rgb(0.5, 0.53, 0.53) })),
      ].filter((d) => d.floorId === floor.id);
      const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
      const deviceLabels: (() => void)[] = [];
      devices.forEach((d) => {
        const halfW = d.widthMm / 2000,
          depth =
            "mounting" in d && d.mounting === "ceiling"
              ? d.heightMm / 1000
              : (d.depthMm ?? 0) / 1000,
          c = Math.cos(d.rotation),
          s = Math.sin(d.rotation);
        const unverified =
          "mounting" in d &&
          (d.mounting === "unknown" ||
            ("legacyUnverified" in d && d.legacyUnverified));
        if (unverified) {
          const center = px(d.position);
          page.drawLine({
            start: { x: center.x - 4, y: center.y - 4 },
            end: { x: center.x + 4, y: center.y + 4 },
            color: d.tint,
            thickness: 1,
          });
          page.drawLine({
            start: { x: center.x - 4, y: center.y + 4 },
            end: { x: center.x + 4, y: center.y - 4 },
            color: d.tint,
            thickness: 1,
          });
        } else if (
          "shape" in d &&
          d.shape === "circle" &&
          d.mounting === "ceiling"
        ) {
          const center = px(d.position);
          page.drawCircle({
            x: center.x,
            y: center.y,
            size: halfW * ratio,
            color: d.tint,
            borderColor: d.tint,
            borderWidth: 0.8,
          });
        } else
          polygon(
            [
              [-halfW, -depth / 2],
              [halfW, -depth / 2],
              [halfW, depth / 2],
              [-halfW, depth / 2],
            ].map(([u, v]) => ({
              x: d.position.x + u * c - v * s,
              y: d.position.y + u * s + v * c,
            })),
            d.tint,
            d.tint,
          );
        const at = px(d.position),
          code = data.codes.get(d.id)!,
          tw = bold.widthOfTextAtSize(code, 8) + 8;
        let chosen = { x: at.x + 7, y: at.y + 9, w: tw, h: 12 };
        for (let attempt = 0; attempt < 80; attempt++) {
          const angle = attempt * 2.4,
            radius = 12 + Math.floor(attempt / 8) * 12;
          const candidate = {
            x: Math.min(
              1134.55 - tw,
              Math.max(56, at.x + Math.cos(angle) * radius),
            ),
            y: Math.min(720, Math.max(145, at.y + Math.sin(angle) * radius)),
            w: tw,
            h: 12,
          };
          if (
            !labelBoxes.some(
              (b) =>
                candidate.x < b.x + b.w &&
                candidate.x + candidate.w > b.x &&
                candidate.y < b.y + b.h &&
                candidate.y + candidate.h > b.y,
            )
          ) {
            chosen = candidate;
            break;
          }
        }
        labelBoxes.push(chosen);
        deviceLabels.push(() => {
          page.drawLine({
            start: at,
            end: { x: chosen.x + tw / 2, y: chosen.y + 3 },
            color: d.tint,
            thickness: 0.5,
          });
          page.drawRectangle({
            x: chosen.x,
            y: chosen.y - 2,
            width: tw,
            height: 12,
            color: rgb(1, 1, 1),
          });
          txt(code, chosen.x + 4, chosen.y + 1, 8, bold, d.tint);
        });
      });
      deviceLabels.forEach((draw) => draw());
      const scale = (1000 * 72) / 25.4 / ratio;
      for (const w of walls) {
        const a = px(w.start),
          b = px(w.end),
          len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 55) continue;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
        const direction =
          (mid.x - box.x - box.w / 2) * normal.x +
            (mid.y - box.y - box.h / 2) * normal.y >=
          0
            ? 1
            : -1;
        const label = `W${p.walls.findIndex((v) => v.id === w.id) + 1} / ${n(wallMeasuredLength(p, w, "internal"))} m interni`,
          tw = font.widthOfTextAtSize(label, 8) + 8;
        const x =
            mid.x +
            normal.x * direction * ((w.thickness * ratio) / 2 + 15) -
            tw / 2,
          yy = mid.y + normal.y * direction * ((w.thickness * ratio) / 2 + 15);
        page.drawRectangle({
          x,
          y: yy - 3,
          width: tw,
          height: 13,
          color: rgb(1, 1, 1),
        });
        txt(label, x + 4, yy, 8);
      }
      for (const r of rooms) {
        const at = px(roomLabelPoint(r.polygon)),
          code = `A${p.rooms.findIndex((v) => v.id === r.id) + 1}`;
        const rr = r.polygon.map(px),
          roomWidth =
            Math.max(...rr.map((v) => v.x)) - Math.min(...rr.map((v) => v.x)),
          roomHeight =
            Math.max(...rr.map((v) => v.y)) - Math.min(...rr.map((v) => v.y));
        const showName = roomWidth > 210 && roomHeight > 140;
        const labelLines = [
          code,
          ...(showName ? wrap(r.name || "Senza nome", 180, 10, bold) : []),
          ...(roomWidth > 160 && roomHeight > 100
            ? [
                r.geometryStatus === "unresolved"
                  ? isSummary
                    ? "—"
                    : "DA RICHIUDERE"
                  : `${n(r.netAreaM2)} m² / ${n(r.designLoadW / 1000, 3)} kW`,
              ]
            : []),
        ];
        let yy = at.y - 25;
        for (let attempt = 0; attempt < 12; attempt++) {
          const candidate = at.y - 25 - attempt * 16;
          if (
            !labelBoxes.some(
              (b) =>
                at.x - 90 < b.x + b.w &&
                at.x + 90 > b.x &&
                candidate - labelLines.length * 13 < b.y + b.h &&
                candidate + 12 > b.y,
            )
          ) {
            yy = candidate;
            break;
          }
        }
        labelLines.forEach((line, i) => {
          const size = i === 0 ? 11 : 10,
            tw = (i < labelLines.length - 1 ? bold : font).widthOfTextAtSize(
              safe(line),
              size,
            );
          page.drawRectangle({
            x: at.x - tw / 2 - 3,
            y: yy - i * 14 - 3,
            width: tw + 6,
            height: 13,
            color: pale,
          });
          txt(
            line,
            at.x - tw / 2,
            yy - i * 14,
            size,
            i < labelLines.length - 1 ? bold : font,
            blue,
          );
        });
      }
      txt(
        `Scala grafica 1:${n(scale, 1)} su A3 - stampa al 100%`,
        56,
        113,
        8.5,
        font,
        muted,
      );
      const bar = Math.min(5, Math.max(1, Math.floor(box.w / ratio / 4)));
      page.drawLine({
        start: { x: 56, y: 90 },
        end: { x: 56 + bar * ratio, y: 90 },
        thickness: 2,
        color: ink,
      });
      txt(`${bar} m`, 56, 73, 8.5);
      tracked("LEGENDA", 420, 112, 6.2, bold, faint, 1.1);
      const legend: [string, ReturnType<typeof rgb>, "line" | "square"][] = [
        ["Mandata", cyan, "line"],
        ["Ripresa", green, "line"],
        ["Radiatore", blue, "square"],
        ["Macchina", rgb(0.55, 0.32, 0.68), "square"],
        ["Plenum", rgb(0.3, 0.65, 0.72), "square"],
        ["Ventilconvettore", rgb(0.79, 0.45, 0.18), "square"],
      ];
      legend.forEach(([label, tint, kind], index) => {
        const lx = 420 + (index % 3) * 118,
          ly = 96 - Math.floor(index / 3) * 15;
        if (kind === "line")
          page.drawLine({
            start: { x: lx, y: ly + 3 },
            end: { x: lx + 16, y: ly + 3 },
            color: tint,
            thickness: 2,
          });
        else
          page.drawRectangle({
            x: lx,
            y: ly,
            width: 7,
            height: 7,
            color: tint,
          });
        txt(label, lx + 24, ly, 7.8, font, ink);
      });
      txt(
        isSummary
          ? "Contorni degli ambienti, muri e apparecchi del progetto. Quote espresse in metri."
          : "Codici e quote completi nelle tabelle. Grigio: contorni netti; arancione: geometria precedente da richiudere; nero: muri.",
        420,
        62,
        7.5,
        font,
        muted,
      );
      const tbX = 1190.55 - 56 - 180,
        tbY = 756;
      page.drawRectangle({
        x: tbX,
        y: tbY,
        width: 180,
        height: 50,
        color: white,
        borderColor: lineStrong,
        borderWidth: 0.7,
      });
      [60, 120].forEach((offset) =>
        page.drawLine({
          start: { x: tbX + offset, y: tbY },
          end: { x: tbX + offset, y: tbY + 50 },
          color: lineStrong,
          thickness: 0.5,
        }),
      );
      tracked("TAVOLA", tbX + 10, tbY + 34, 5.8, bold, faint, 0.8);
      txt(
        `${String(p.floors.indexOf(floor) + 1).padStart(2, "0")} / ${String(p.floors.length).padStart(2, "0")}`,
        tbX + 10,
        tbY + 20,
        9,
        bold,
        navy,
      );
      tracked("SCALA", tbX + 70, tbY + 34, 5.8, bold, faint, 0.8);
      txt(`1:${n(scale, 1)}`, tbX + 70, tbY + 20, 9, bold, navy);
      tracked("FORMATO", tbX + 130, tbY + 34, 5.8, bold, faint, 0.8);
      txt("A3 · 100%", tbX + 130, tbY + 20, 9, bold, navy);
      if (isSummary) continue;
      newPage(`Legenda e quote - ${floor.name}`);
      table(
        ["Codice", "Ambiente", "Area netta", "Perimetro netto"],
        rooms.map((r) => [
          `A${p.rooms.findIndex((v) => v.id === r.id) + 1}`,
          r.name || "Senza nome",
          r.geometryStatus === "unresolved"
            ? "Da ricalcolare"
            : `${n(r.netAreaM2)} m²`,
          r.geometryStatus === "unresolved"
            ? "Da ricalcolare"
            : `${n(r.perimeterM)} m`,
        ]),
        [0.12, 0.43, 0.22, 0.23],
      );
      heading("Quote interne utili dei muri");
      table(
        [
          "Muro",
          "Origine asse x/y m",
          "Fine asse x/y m",
          "Interna utile m",
          "Spessore m",
        ],
        walls.map((w) => [
          `W${p.walls.findIndex((v) => v.id === w.id) + 1}`,
          `${n(w.start.x)} / ${n(w.start.y)}`,
          `${n(w.end.x)} / ${n(w.end.y)}`,
          n(wallMeasuredLength(p, w, "internal")),
          n(w.thickness),
        ]),
        [0.12, 0.23, 0.23, 0.24, 0.18],
      );
    }
  };
  const invalid = data.checks.filter((c) => c.status === "invalid").length,
    warnings = data.checks.filter((c) => c.status === "warning").length;
  let coverPagesY = 0;
  const drawCover = () => {
    coverPage = doc.addPage([width, height]);
    page = coverPage;
    page.drawRectangle({
      x: 0,
      y: height - 26,
      width,
      height: 26,
      color: band,
    });
    tracked(
      "TERMOIDRAULICA STAIANO",
      56,
      height - 17,
      6.8,
      bold,
      bandText,
      1.5,
    );
    const bandRight = variantLabel.toUpperCase();
    tracked(
      bandRight,
      width - 56 - trackedWidth(bandRight, 6.8, bold, 1.5),
      height - 17,
      6.8,
      bold,
      navText,
      1.5,
    );
    const qrSize = 124,
      qrX = width - 56 - qrSize,
      qrY = height - 190;
    if (options.logoSvg) {
      for (const match of options.logoSvg.matchAll(
        /<path\b[^>]*fill="(#[0-9a-fA-F]{6})"[^>]*d="([^"]+)"/g,
      )) {
        const c = match[1];
        page.drawSvgPath(match[2], {
          x: 56,
          y: qrY + qrSize,
          scale: qrSize / 646,
          color: rgb(
            parseInt(c.slice(1, 3), 16) / 255,
            parseInt(c.slice(3, 5), 16) / 255,
            parseInt(c.slice(5, 7), 16) / 255,
          ),
        });
      }
    }
    page.drawRectangle({
      x: qrX,
      y: qrY,
      width: qrSize,
      height: qrSize,
      color: white,
    });
    const moduleSize = qrSize / (qr.modules.size + 8);
    for (let row = 0; row < qr.modules.size; row++)
      for (let col = 0; col < qr.modules.size; col++)
        if (qr.modules.get(row, col))
          page.drawRectangle({
            x: qrX + (col + 4) * moduleSize,
            y: qrY + qrSize - (row + 5) * moduleSize,
            width: moduleSize,
            height: moduleSize,
            color: navy,
          });
    page.node.addAnnot(
      doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [qrX, qrY, qrX + qrSize, qrY + qrSize],
          Border: [0, 0, 0],
          A: { Type: "Action", S: "URI", URI: PDFString.of(guideUrl) },
        }),
      ),
    );
    txt(
      "Il tuo progetto e la guida al dossier",
      qrX - 30,
      qrY - 11,
      7.4,
      font,
      muted,
    );
    let cy = height - 238;
    let titleSize = 29;
    while (
      titleSize > 14 &&
      wrap(p.name, width - 112, titleSize, bold).length * titleSize * 1.2 > 110
    )
      titleSize--;
    for (const line of wrap(p.name, width - 112, titleSize, bold)) {
      txt(line, 56, cy, titleSize, bold, navy);
      cy -= titleSize * 1.2;
    }
    cy -= 4;
    txt(
      "Impianti termotecnici · configurazione e dimensionamento preliminare",
      56,
      cy,
      10,
      font,
      muted,
    );
    cy -= 25;
    page.drawLine({
      start: { x: 56, y: cy },
      end: { x: width - 56, y: cy },
      color: lineStrong,
      thickness: 0.8,
    });
    const updated = new Date(p.updatedAt),
      meta: [string, string, string, string][] = [
        [
          "ELABORATO IL",
          date.toLocaleDateString("it-IT"),
          isSummary ? "DOCUMENTO" : "CONTROLLI",
          isSummary
            ? "Riepilogo cliente"
            : `${invalid} ${invalid === 1 ? "errore" : "errori"} · ${warnings} ${warnings === 1 ? "avviso" : "avvisi"}`,
        ],
        [
          "PROGETTO AGGIORNATO",
          updated.toLocaleString("it-IT", {
            dateStyle: "short",
            timeStyle: "short",
          }),
          "IMPIANTI",
          `${p.hvacSystems.length} HVAC · ${p.radiators.length} radiatori · ${p.airTerminals.length} terminali`,
        ],
        ["SCHEMA PROGETTO", String(p.schemaVersion), "PAGINE", ""],
      ],
      metaTop = cy - 30;
    meta.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
      const rowY = metaTop - index * 42;
      tracked(leftLabel, 56, rowY, 6.6, bold, faint, 1);
      txt(leftValue, 56, rowY - 14, 9.5, font, ink);
      tracked(rightLabel, 306, rowY, 6.6, bold, faint, 1);
      const tone =
        rightLabel === "CONTROLLI"
          ? invalid
            ? red
            : warnings
              ? amber
              : green
          : ink;
      if (rightValue)
        txt(
          rightValue,
          306,
          rowY - 14,
          9.5,
          rightLabel === "CONTROLLI" ? bold : font,
          tone,
        );
    });
    coverPagesY = metaTop - 84 - 14;
    const stripTop = metaTop - 140;
    page.drawLine({
      start: { x: 56, y: stripTop + 20 },
      end: { x: width - 56, y: stripTop + 20 },
      color: lineStrong,
      thickness: 0.8,
    });
    const metrics: [string, string][] = [
      ["AMBIENTI", String(p.rooms.length)],
      ["SUPERFICIE NETTA · M²", n(data.totals.areaM2)],
      ["VOLUME NETTO · M³", n(data.totals.volumeM3)],
      ["FABBISOGNO · KW", n(data.totals.loadW / 1000, 3)],
    ];
    metrics.forEach(([label, value], index) => {
      const cell = (width - 112) / metrics.length,
        centerX = 56 + cell * (index + 0.5);
      centered(value, centerX, stripTop - 12, 20, bold, navy);
      tracked(
        label,
        centerX - trackedWidth(label, 6.4, bold, 1) / 2,
        stripTop - 31,
        6.4,
        bold,
        faint,
        1,
      );
    });
    const scope =
      options.variant === "summary"
        ? "Ambienti · apparecchi scelti · distinta materiali · render 3D"
        : "Planimetrie A3 · schede ambiente · impianti e plenum · distinta materiali · controlli · provenienze";
    tracked("CONTENUTO", 56, stripTop - 80, 6.4, bold, faint, 0.8);
    txt(scope, 56, stripTop - 96, 8.5, font, muted);
    page.drawRectangle({
      x: 56,
      y: 54,
      width: width - 112,
      height: 54,
      color: paper2,
    });
    page.drawLine({
      start: { x: 56, y: 108 },
      end: { x: width - 56, y: 108 },
      color: navy,
      thickness: 1.4,
    });
    tracked("NOTA", 72, 94, 5.8, bold, faint, 0.8);
    (isSummary
      ? [
          "Configurazione degli ambienti e degli impianti scelti.",
          "Render 3D e riepilogo dei materiali del progetto.",
        ]
      : [
          `Documento preliminare. Il dimensionamento convenzionale (${n(p.projectSettings.coefficientWm3)} W/m³) non sostituisce il calcolo delle`,
          "dispersioni né il progetto esecutivo. Verificare dati, fonti e disponibilità commerciale prima dell'ordine.",
        ]
    ).forEach((line, index) => txt(line, 72, 80 - index * 12, 8, font, ink));
    page.drawRectangle({ x: 0, y: 0, width, height: 30, color: band });
    tracked(
      "GENERATO DAL CONFIGURATORE STAIANO HVAC",
      56,
      12,
      6.4,
      bold,
      navText,
      1.2,
    );
  };
  drawCover();
  newPage("Sintesi del progetto");
  const count = (value: number, one: string, many: string) =>
    `${value} ${value === 1 ? one : many}`;
  paragraph(
    isSummary
      ? `Elaborato il ${date.toLocaleDateString("it-IT")}. ${[
          count(p.rooms.length, "ambiente", "ambienti"),
          p.hvacSystems.length
            ? count(p.hvacSystems.length, "impianto", "impianti")
            : "",
          p.radiators.length
            ? count(p.radiators.length, "radiatore", "radiatori")
            : "",
        ]
          .filter(Boolean)
          .join(", ")}.`
      : `Elaborato il ${date.toLocaleDateString("it-IT")}. ${p.floors.length} piani, ${p.walls.length} muri, ${p.rooms.length} ambienti; ${p.hvacSystems.length} sistemi HVAC, ${p.radiators.length} radiatori, ${p.airTerminals.length} terminali aria.`,
    9,
    muted,
  );
  if (!isSummary && data.provisionalRooms.length)
    notice(
      "Contorni aperti",
      `${data.provisionalRooms.length} ambienti con contorno aperto. I totali considerano solo gli ambienti chiusi; i dati precedenti degli ambienti aperti restano conservati per il recupero e non sono validabili.`,
      "error",
    );
  if (!isSummary) {
    statusStrip(invalid, warnings);
    heading(
      invalid ? "Elaborato con controlli non superati" : "Stato dei controlli",
    );
    paragraph(
      "Il dossier riporta lo stato corrente del progetto, compresi dati mancanti e criticità.",
    );
    heading("Metodo e limiti");
    notice("Limiti del calcolo", TECHNICAL_NOTE, "info");
    paragraph(
      "Superfici e volumi riferiti ai contorni netti interni dei muri. I disegni quotati rappresentano le geometrie del progetto; stampare al 100% per rispettare la scala indicata. Le misure numeriche prevalgono sulla misura a righello.",
      8.5,
      muted,
    );
  } else
    paragraph(
      `Dimensionamento convenzionale: ${n(p.projectSettings.coefficientWm3)} W/m³. Superfici e volumi netti degli ambienti; quote espresse in metri.`,
      9,
      muted,
    );
  if (options.variant === "summary") {
    // Customer tables retain catalog facts; diagnostic clauses stay in the complete dossier.
    const clientFacts = (value: string) =>
      value
        .split(/;\s*/)
        .filter(
          (clause) =>
            !/verific|orientativ|schematic|non (disponib|dichiarat|documentat|pubblicat|scelt|present)|da (collegare|completare|definire|riconfigurare)/i.test(
              clause,
            ),
        )
        .join("; ");
    heading("Ambienti e apparecchi scelti");
    paragraph(
      "Riepilogo degli ambienti e della configurazione salvata, con render 3D nelle pagine finali.",
      9,
      muted,
    );
    if (p.rooms.length)
      table(
        ["Ambiente", "Misure interne m", "Netta m² / volume m³", "Carico kW"],
        p.rooms.map((room) => {
          const sides = roomMeasuredSides(p, room, "internal");
          return [
            room.conditioningExclusion
              ? `${room.name} — non climatizzato: ${room.conditioningExclusion.reason}`
              : room.name,
            room.geometryStatus === "unresolved"
              ? "—"
              : sides
                ? `${n(sides.width)} x ${n(sides.length)}; H ${n(room.heightM)}`
                : `Irregolare; H ${n(room.heightM)}`,
            room.geometryStatus === "unresolved"
              ? "—"
              : `${n(room.netAreaM2)} / ${n(room.volumeM3)}`,
            room.geometryStatus === "unresolved"
              ? "—"
              : n(room.designLoadW / 1000, 3),
          ];
        }),
        [0.3, 0.28, 0.25, 0.17],
      );
    else paragraph("Nessun ambiente inserito.", 9, muted);
    if (data.materials.length || data.accessories.length) {
      table(
        ["Descrizione / codici", "Quantità", "Dimensioni", "Caratteristiche"],
        [...data.materials, ...data.accessories].map((row) => [
          `${row.description}${row.sku ? `; Codice articolo ${row.sku}` : ""}; ${row.codes.join(", ")}`,
          quantityText(row),
          clientFacts(row.dimensions ?? ""),
          clientFacts(row.details),
        ]),
        [0.28, 0.14, 0.19, 0.39],
        "Distinta materiali",
      );
    }
    for (const system of p.hydronicSystems ?? []) {
      const outdoor = system.outdoorUnit;
      const product = heatPumpProductAtVersion(
        system.productId,
        system.catalogVersion,
      );
      const point = product?.operatingPoints[system.operatingPointIndex];
      const capacity = point && heatPumpCapacity(point);
      heading(`Pompa di calore ${data.codes.get(system.id)} - ${system.name}`);
      paragraph(
        `Unita esterna ${data.codes.get(outdoor.id)}: piano ${p.floors.find((floor) => floor.id === outdoor.floorId)?.name}; X ${n(outdoor.position.x)}, Y ${n(outdoor.position.y)}, quota ${n(outdoor.elevationM)} m. Ventilconvettori collegati: ${system.fanCoilIds.map((id) => data.codes.get(id) ?? id).join(", ") || "nessuno"}.`,
        9,
      );
      paragraph(
        point
          ? `Potenze ${capacity!.basis}: ${n(capacity!.heatingW)} W caldo / ${n(capacity!.coolingW)} W freddo. Condizioni caldo: ${point.heatingConditions}; freddo: ${point.coolingConditions}.`
          : "",
        8,
        muted,
      );
    }
    const ductedSystems = p.hvacSystems.filter(
      (candidate) => candidate.type === "ducted",
    );
    // I dati degli impianti assenti non compaiono nel riepilogo.
    if (ductedSystems.length) {
      newPage("Bilanci e plenum dedicati");
      heading("Metri richiesti / installati e capacita reale");
      if (data.linearBalances.length)
        table(
          [
            "Sistema / funzione / modello",
            "Richiesti / installati m",
            "Portata richiesta / disponibile",
          ],
          data.linearBalances.map((balance) => [
            `${data.codes.get(balance.systemId)} ${balance.use === "supply" ? "mandata" : "ripresa"}; ${balance.familyCode}${balance.mixedModels ? "; modelli misti" : ""}`,
            `${n(balance.requiredM)} / ${n(balance.installedM)}`,
            `${n(balance.airflowM3h)} / ${n(balance.availableAirflowM3h)} m³/h`,
          ]),
          [0.38, 0.27, 0.35],
        );
      else
        paragraph(
          "Nessun bilancio lineare disponibile per i sistemi canalizzati configurati.",
          9,
          muted,
        );
    }
    const separate = p.plenums.filter((pl) => pl.attachmentId !== undefined);
    if (separate.length) {
      heading("Plenum collegati");
      table(
        ["Plenum / elemento", "Dimensioni L x H x P", "Stacchi / quota"],
        separate.map((pl) => [
          `${data.codes.get(pl.id)} - ${pl.use === "supply" ? "mandata" : "ripresa"}; ${pl.attachmentId ? (data.codes.get(pl.attachmentId) ?? "elemento") : "da collegare"}`,
          `${n(pl.widthMm)} x ${n(pl.heightMm)} x ${n(pl.depthMm)} mm`,
          `${pl.portCount ?? 1} x diam. ${pl.portDiameterMm ?? 160} mm; ${n(pl.elevationM ?? 0)} m`,
        ]),
        [0.38, 0.34, 0.28],
      );
    }
    for (const system of ductedSystems.filter(
      (s) => !separate.some((pl) => pl.systemId === s.id),
    )) {
      const plenum = calculateSupplyPlenum(p, system.id);
      const machineName = `${data.codes.get(system.id)} · ${system.manufacturer} ${plenum.machineModel ?? system.productId}`;
      const placed = p.plenums.find(
        (candidate) =>
          candidate.systemId === system.id && candidate.use === "supply",
      );
      const geometry = placed
        ? placedPlenumGeometry(p, placed)
        : plenum.machineGeometry;
      ensure(110);
      heading(
        `${data.codes.get(system.id)} - plenum ${placed ? data.codes.get(placed.id) : "proposto"}`,
      );
      paragraph(
        `Macchina ${machineName}; ${plenum.branches.length} attacchi richiesti / ${geometry?.ports.length ?? 0} disegnabili. ${placed ? `Dimensioni scelte ${n(placed.widthMm)} x ${n(placed.heightMm)} x ${n(placed.depthMm)} mm; X ${n(placed.position.x)}, Y ${n(placed.position.y)}, quota ${n(placed.elevationM ?? 0)} m.` : "Plenum proposto."}`,
        9,
      );
      const inlet = geometry?.inlet;
      if (
        inlet?.clearOpeningWidthMm != null &&
        inlet.clearOpeningHeightMm != null
      )
        paragraph(
          `Luce interna raccordo macchina: ${n(inlet.clearOpeningWidthMm)} x ${n(inlet.clearOpeningHeightMm)} mm.`,
          8,
          muted,
        );
      const front = plenumTechnicalDrawing(p, system.id, "front"),
        isometric = plenumTechnicalDrawing(p, system.id, "isometric");
      if (front && isometric) {
        ensure(250);
        heading("Viste del plenum");
        const top = y,
          half = (usable - 20) / 2;
        centered(
          "Vista frontale - tutti gli attacchi",
          margin + half / 2,
          top - 5,
          8.2,
          bold,
          navy,
        );
        centered(
          "Vista 3D isometrica del plenum",
          margin + half + 20 + half / 2,
          top - 5,
          8.2,
          bold,
          navy,
        );
        y = top - 22;
        drawTechnical(front, 170, machineName, { x: margin, width: half });
        const bottom = y;
        y = top - 22;
        drawTechnical(isometric, 170, machineName, {
          x: margin + half + 20,
          width: half,
        });
        y = Math.min(y, bottom);
      }
      ensure(110);
      table(
        [
          "Attacco / bocchette",
          "Ø nominale mm",
          "Portata m³/h",
          "Velocita m/s",
        ],
        plenum.branches.map((branch, index) => [
          `${index + 1} - ${branch.terminalIds.map((id) => data.codes.get(id) ?? id).join(", ")}`,
          branch.diameterMm === null ? "—" : n(branch.diameterMm),
          n(branch.airflowM3h),
          branch.velocityMs === null ? "n.d." : n(branch.velocityMs),
        ]),
        [0.35, 0.22, 0.23, 0.2],
      );
      const returnPlenum = p.plenums.find(
        (candidate) =>
          candidate.systemId === system.id && candidate.use === "return",
      );
      if (returnPlenum) {
        const returned = calculatePlenum(p, system.id, "return");
        ensure(48);
        paragraph(
          `Plenum di ripresa ${data.codes.get(returnPlenum.id)}: ${returned.branches.length} stacchi, corpo ${n(returnPlenum.widthMm)} × ${n(returnPlenum.heightMm)} × ${n(returnPlenum.depthMm)} mm.`,
          9,
        );
      }
    }
  } else {
    heading("Riepilogo ambienti");
    if (p.rooms.length)
      table(
        [
          "Codice / stanza / piano",
          "Netta m²",
          "H m",
          "Volume m³",
          "Q kW / BTU/h",
        ],
        p.rooms.map((r, i) => [
          `A${i + 1} - ${r.name || "Senza nome"}\n${p.floors.find((f) => f.id === r.floorId)?.name}`,
          r.geometryStatus === "unresolved" ? "Da ricalcolare" : n(r.netAreaM2),
          n(r.heightM),
          r.geometryStatus === "unresolved" ? "Da ricalcolare" : n(r.volumeM3),
          r.geometryStatus === "unresolved"
            ? "NON VALIDABILE"
            : r.conditioningExclusion
              ? "Escluso"
              : `${n(r.designLoadW / 1000, 3)} / ${n(wattsToBtuh(r.designLoadW), 0)}`,
        ]),
        [0.38, 0.13, 0.1, 0.17, 0.22],
      );
    else paragraph("Nessun ambiente inserito.", 9, muted);
    drawFloorPlans();
    for (const [index, r] of p.rooms.entries()) {
      newPage(`A${index + 1} - ${r.name || "Senza nome"}`);
      if (r.geometryStatus === "unresolved")
        notice(
          "Contorno aperto",
          "Dimensioni, volume e carico sotto sono quelli dell'ultima configurazione chiusa. Non sono dati attuali validabili. Richiudere il contorno e riconfigurare gli apparecchi prima di usare il dossier.",
          "error",
        );
      paragraph(
        `Piano: ${p.floors.find((f) => f.id === r.floorId)?.name}; impianto: ${{ none: "da definire", radiator: "radiatori", ducted: "canalizzato", split: "split", vrv: "VRV/VRF", fanCoil: "ventilconvettori" }[r.systemType]}`,
      );
      if (r.conditioningExclusion)
        paragraph(
          `AMBIENTE NON CLIMATIZZATO — ${r.conditioningExclusion.reason}. Escluso dal fabbisogno da dimensionare; geometria e apparecchi conservati.`,
          11,
        );
      statRow([
        ["Superficie netta", `${n(r.netAreaM2)} m²`],
        ["Perimetro", `${n(r.perimeterM)} m`],
        [r.roof ? "Gronda" : "Altezza", `${n(r.heightM)} m`],
        ["Volume netto", `${n(r.volumeM3)} m³`],
      ]);
      if (r.roof)
        paragraph(
          `Tetto a due falde: gronda ${n(r.heightM)} m, colmo ${n(r.roof.ridgeHeightM)} m.`,
          9,
        );
      if (r.ceilingBands?.length)
        paragraph(
          `Controsoffitto a livelli: ${r.ceilingBands.map((b) => `${b.name}, quota ${n(b.elevationM)} m, larghezza ${n(b.depthM)} m, lunghezza ${n(b.lengthM)} m`).join("; ")}.`,
          9,
        );
      heading(
        r.geometryStatus === "unresolved"
          ? "Carico precedente - NON VALIDABILE"
          : "Fabbisogno convenzionale",
      );
      paragraph(
        r.conditioningExclusion
          ? "Carico da dimensionare: 0 W per esclusione esplicita dell’operatore."
          : `${n(r.volumeM3, 4)} m³ x ${n(p.projectSettings.coefficientWm3)} W/m³ = ${n(r.designLoadW, 2)} W = ${n(r.designLoadW / 1000, 3)} kW = ${n(wattsToBtuh(r.designLoadW), 0)} BTU/h. Calcolo senza arrotondamenti intermedi; valori stampati arrotondati.`,
      );
      const rad = p.radiators.filter((d) => d.roomId === r.id);
      if (rad.length) {
        heading("Radiatori");
        table(
          ["Codice / modello", "Elementi / DT", "L x H x P mm", "Potenza W"],
          rad.map((d) => [
            `${data.codes.get(d.id)} - ${d.manufacturer} ${d.family} (${d.productId})`,
            `${d.elements} / ${n(d.deltaTK)} K`,
            `${n(d.widthMm)} x ${n(d.heightMm)} x ${n(d.depthMm)}`,
            n(d.outputW),
          ]),
          [0.42, 0.17, 0.25, 0.16],
        );
        paragraph(
          `Potenza totale radiatori: ${n(rad.reduce((sum, d) => sum + d.outputW, 0))} W. Resa riferita al DT configurato; relazione di catalogo e versione riportate nelle fonti.`,
          9,
        );
      }
      const allocation =
        r.geometryStatus === "closed" ? ductedRoomAllocation(p, r.id) : null;
      if (allocation) {
        heading("Ripartizione canalizzato");
        paragraph(
          `Sistema ${data.codes.get(allocation.system.id)}; portata totale macchina ${n(allocation.system.airflowM3h!)} m³/h. Quota stanza = Q stanza / somma Q stanze servite x portata totale = ${n(allocation.airflowM3h)} m³/h. Punti mandata ${r.supplyPoints}; punti ripresa ${r.returnPoints}.`,
        );
      }
      const air = p.airTerminals.filter((d) => d.roomId === r.id);
      if (air.length) {
        heading("Terminali aria");
        table(
          [
            "Codice / famiglia / posa",
            "Misura mm / quota m",
            "Q richiesto / disponibile",
            "Rumore / Pa",
          ],
          air.map((d) => [
            `${data.codes.get(d.id)} - ${d.family} ${d.use === "supply" ? "mandata" : "ripresa"}; ${d.mounting === "ceiling" ? "soffitto" : d.mounting === "wall" ? "parete" : "da riconfigurare"}; punto ${d.pointIndex === null ? "da riconfigurare" : d.pointIndex + 1}`,
            `${n(d.widthMm)} x ${n(d.heightMm)} x ${d.depthMm === null ? "n.d." : n(d.depthMm)}; quota ${d.elevationM === null ? "non disponibile" : n(d.elevationM) + " m"}`,
            `${n(d.requiredAirflowM3h)} / ${n(d.availableAirflowM3h)} m³/h${d.theoreticalLengthM === null ? "" : `; teorica ${n(d.theoreticalLengthM, 3)} m`}`,
            `${d.noiseLabel || (d.noiseDbA === null ? "non pubblicato" : n(d.noiseDbA))} dB(A); ${d.pressureDropPa === null ? "n.d." : n(d.pressureDropPa)} Pa`,
          ]),
          [0.31, 0.28, 0.24, 0.17],
        );
        paragraph(
          "Rumore: riferimento del costruttore e punto operativo selezionato; limite configuratore 37 dB(A) solo per la mandata. La ripresa si dimensiona sulla portata macchina. Il valore non rappresenta una verifica acustica complessiva in ambiente. Le misure commerciali restano distinte dalla lunghezza teorica.",
          9,
          muted,
        );
      }
      const units = p.hvacSystems.flatMap((s) =>
        s.fanCoilId
          ? []
          : s.indoorUnits
              .filter((d) => d.roomId === r.id)
              .map((d) => ({ s, d })),
      );
      if (units.length) {
        heading("Unità interne split e macchine canalizzate");
        table(
          ["Codice / sistema", "Modello", "L x H x P mm", "Compatibilità"],
          units.map(({ s, d }) => [
            `${data.codes.get(d.id)} / ${data.codes.get(s.id)}`,
            hvacProductAtVersion(d.productId, d.catalogVersion)?.indoorModel ??
              splitIndoorAtVersion(d.productId, d.catalogVersion)?.model ??
              d.productId,
            `${n(d.widthMm)} x ${n(d.heightMm)} x ${n(d.depthMm)}`,
            s.compatibilityStatus === "verified"
              ? "verificata"
              : "NON VERIFICATA",
          ]),
          [0.2, 0.35, 0.25, 0.2],
        );
      }
      const fanCoils = (p.fanCoils ?? []).filter(
        (unit) => unit.roomId === r.id,
      );
      if (fanCoils.length) {
        heading("Ventilconvettori e comandi originali");
        table(
          [
            "Codice / modello / posa",
            "Ingombro / quota",
            "Punto operativo / potenze",
            "Comando / scheda",
          ],
          fanCoils.map((unit) => {
            const product = fanCoilProductAtVersion(
              unit.productId,
              unit.catalogVersion,
            );
            const point = product && fanCoilMaximumPoint(product).point;
            const control = unit.controllerId
              ? fanCoilControlAtVersion(unit.controllerId, unit.catalogVersion)
              : null;
            const expected =
              product && control ? controllerBoardFor(product, control) : null;
            return [
              `${data.codes.get(unit.id)} - ${product ? `${product.manufacturer} ${product.family} ${product.model}; ${product.pipes} tubi` : unit.productId}; ${unit.mounting === "wall" ? "parete" : "soffitto"}`,
              `${n(unit.widthMm)} x ${n(unit.heightMm)} x ${n(unit.depthMm)} mm; quota ${n(unit.elevationM)} m`,
              point
                ? `${point.label}; freddo ${n(point.coolingW)} W / caldo ${n(point.heatingW)} W; ${point.noiseDbA === null ? "rumore n.d." : `${n(point.noiseDbA)} dB(A)`}`
                : "Dati storici non verificabili",
              unit.controllerId
                ? `${control ? `${control.manufacturer} ${control.series} ${control.model}` : unit.controllerId}; ${unit.controllerBoard ?? "scheda non scelta"}; ${expected && expected === unit.controllerBoard ? "documentato" : "DA VERIFICARE"}`
                : "Non scelto",
            ];
          }),
          [0.3, 0.2, 0.28, 0.22],
        );
        for (const unit of fanCoils) {
          const product = fanCoilProductAtVersion(
            unit.productId,
            unit.catalogVersion,
          );
          const point = product && fanCoilMaximumPoint(product).point;
          if (point)
            paragraph(
              `${data.codes.get(unit.id)} - condizioni freddo: ${point.coolingConditions}; caldo: ${point.heatingConditions}; rumore: ${point.noiseConditions}. ${product?.dimensionNote}`,
              8,
              muted,
            );
        }
      }
      if (!rad.length && !air.length && !units.length && !fanCoils.length)
        paragraph("Nessun apparecchio associato a questo ambiente.", 10, muted);
    }
    newPage("Calcoli, suggerimenti e configurazione finale");
    paragraph(
      "I calcoli di requisito, i suggerimenti automatici e i singoli pezzi scelti dall'operatore sono riportati separatamente. Nessuna lunghezza minima identifica una singola bocchetta.",
    );
    if (data.linearBalances.length) {
      heading("Calcoli - metri lineari richiesti / installati");
      table(
        [
          "Sistema / funzione",
          "Richiesti m",
          "Installati m",
          "Margine m / esito",
        ],
        data.linearBalances.map((b) => [
          `${data.codes.get(b.systemId)} ${b.use === "supply" ? "mandata" : "ripresa"} (${b.familyCode})`,
          n(b.requiredM),
          n(b.installedM),
          `${b.marginM >= 0 ? "+" : ""}${n(b.marginM)} / ${b.status === "deficit" ? "WARNING" : "sufficiente"}`,
        ]),
        [0.39, 0.18, 0.18, 0.25],
      );
      for (const b of data.linearBalances.filter((b) => b.mixedModels))
        paragraph(
          `${data.codes.get(b.systemId)}: modelli misti, capacità ${n(b.availableAirflowM3h)} / ${n(b.airflowM3h)} m³/h. I metri richiesti usano ${b.familyCode} come riferimento; equivalente installato ${n(b.equivalentInstalledM)} m. Il margine dei metri fisici non certifica la capacità dei modelli diversi.`,
          9,
          muted,
        );
    }
    for (const system of p.hvacSystems.filter((s) => s.linearPlan)) {
      heading(`Suggerimento automatico - ${data.codes.get(system.id)}`);
      paragraph(
        `Stato decisione: ${system.linearPlan!.status}. Riparto proporzionale al carico convenzionale degli ambienti; proposta facoltativa, distinta dalle bocchette installate.`,
        9,
      );
      table(
        ["Stanza", "Funzione", "Metri suggeriti", "Portata m³/h"],
        system.linearPlan!.distribution.map((r) => [
          p.rooms.find((room) => room.id === r.roomId)?.name ??
            "Ambiente precedente",
          r.use === "supply" ? "Mandata" : "Ripresa",
          n(r.suggestedM),
          n(r.airflowM3h),
        ]),
        [0.4, 0.18, 0.2, 0.22],
      );
    }
    if (p.airTerminals.length) {
      heading("Configurazione finale dell'operatore - singole bocchette");
      table(
        [
          "Pezzo / stanza / modello",
          "Lunghezza / posa",
          "Stile / colore / finitura",
          "Posizione / collegamento",
        ],
        p.airTerminals.map((t) => [
          `${data.codes.get(t.id)} - ${p.rooms.find((r) => r.id === t.roomId)?.name}; ${t.family} / ${t.productId}`,
          `${n(t.widthMm, 0)} mm; ${t.mounting === "wall" ? "parete" : t.mounting === "ceiling" ? "soffitto" : "da verificare"}; ${t.decisionOrigin}`,
          `${t.style || "non scelto"}; ${t.color || "non scelto"}; ${t.finish || "non scelta"}${t.productCode ? `; codice ${t.productCode}` : ""}`,
          `X ${n(t.position.x)}, Y ${n(t.position.y)} m; quota ${t.elevationM === null ? "n.d." : n(t.elevationM)} m; ${n((t.rotation * 180) / Math.PI, 0)} gradi; ${t.plenumId ? data.codes.get(t.plenumId) : "plenum non collegato"}`,
        ]),
        [0.31, 0.2, 0.24, 0.25],
      );
    }
    heading("Quote interne utili");
    if (p.rooms.length)
      table(
        ["Ambiente", "Larghezza interna", "Lunghezza interna"],
        p.rooms.map((r) => {
          const sides = roomMeasuredSides(p, r, "internal");
          return [
            r.name,
            sides ? `${n(sides.width)} m` : "Contorno irregolare",
            sides
              ? `${n(sides.length)} m`
              : `Perimetro netto ${n(r.perimeterM)} m`,
          ];
        }),
        [0.4, 0.3, 0.3],
      );
    else paragraph("Nessun ambiente inserito.", 9, muted);
    if (p.walls.length)
      table(
        ["Parete", "Misura interna utile", "Spessore"],
        p.walls.map((w, i) => [
          `${i + 1}`,
          `${n(wallMeasuredLength(p, w, "internal"))} m`,
          `${n(w.thickness * 1000, 0)} mm`,
        ]),
        [0.2, 0.5, 0.3],
      );
    // Senza sistemi configurati la pagina non viene creata: nessun dato inventato.
    // Le distribuzioni aerauliche dei ventilconvettori sono documentate nella
    // scheda dell'unità e nelle pagine plenum: nessun doppio conteggio.
    const scheduledSystems = p.hvacSystems.filter((s) => !s.fanCoilId);
    if (scheduledSystems.length) newPage("Sistemi HVAC");
    for (const s of scheduledSystems) {
      const product = hvacProductAtVersion(s.productId, s.catalogVersion),
        combination =
          s.type === "split"
            ? splitCombinationAtVersion(s.productId, s.catalogVersion)
            : null,
        vrvOutdoor =
          s.type === "vrv"
            ? vrvOutdoorAtVersion(s.productId, s.catalogVersion)
            : null,
        indoorModels =
          s.type === "vrv"
            ? s.indoorUnits
                .map(
                  (d) =>
                    vrvIndoorAtVersion(d.productId, d.catalogVersion)?.model ??
                    d.productId,
                )
                .join(" + ")
            : combination
              ? s.indoorUnits
                  .map(
                    (d) =>
                      splitIndoorAtVersion(d.productId, d.catalogVersion)
                        ?.model ?? d.productId,
                  )
                  .join(" + ")
              : (product?.indoorModel ?? s.productId),
        outdoorModel =
          product?.outdoorModel ??
          vrvOutdoor?.model ??
          combination?.outdoorModel ??
          "non verificabile",
        rawLoad = p.rooms
          .filter((r) => s.roomIds.includes(r.id))
          .reduce((sum, r) => sum + r.designLoadW, 0),
        // Più macchine sugli stessi ambienti: in scheda il carico per macchina.
        load =
          s.type === "ducted"
            ? rawLoad /
              machineLoadDivisor(p, s.roomIds, s.plannedMachines, s.id)
            : rawLoad;
      heading(
        `${data.codes.get(s.id)} - ${s.manufacturer} ${
          s.type === "ducted"
            ? "canalizzato"
            : s.type === "vrv"
              ? "VRV/VRF"
              : "split"
        }`,
      );
      paragraph(
        `Unità interna: ${indoorModels}; unità esterna: ${outdoorModel}. Stanze servite: ${p.rooms
          .filter((r) => s.roomIds.includes(r.id))
          .map((r) => r.name || r.id)
          .join(", ")}.`,
      );
      table(
        [
          "Q richiesto kW",
          "Freddo kW",
          "Caldo kW",
          "Portata m³/h",
          "Pressione statica Pa",
        ],
        [
          [
            n(load / 1000, 3),
            s.capacityW === null ? "Non dichiarata" : n(s.capacityW / 1000, 3),
            (vrvOutdoor?.heatingW ??
            product?.heatingCapacityW ??
            combination?.heatingCapacityW)
              ? n(
                  (vrvOutdoor?.heatingW ??
                    product?.heatingCapacityW ??
                    combination?.heatingCapacityW)! / 1000,
                  3,
                )
              : "n.d.",
            s.airflowM3h ? n(s.airflowM3h) : "n.d.",
            product?.staticPressurePa === null ||
            product?.staticPressurePa === undefined
              ? "n.d."
              : n(product.staticPressurePa),
          ],
        ],
        [0.2, 0.18, 0.18, 0.21, 0.23],
      );
      paragraph(
        `Abbinamento: ${s.compatibilityStatus === "verified" ? "verificato su dati di catalogo" : "NON VERIFICATO"}. Versione ${s.catalogVersion}. ${
          vrvOutdoor
            ? `Unità esterna ${vrvOutdoor.model}: ${vrvOutdoor.dimensionNote}`
            : (product?.technicalNotes ??
              combination?.notes ??
              "Dati storici di catalogo non disponibili: verificare il sistema prima dell'ordine.")
        }`,
        9,
      );
      if (vrvOutdoor) {
        const connected = s.indoorUnits.reduce(
          (sum, d) =>
            sum +
            (vrvIndoorAtVersion(d.productId, d.catalogVersion)
              ?.nominalCoolingW ?? 0),
          0,
        );
        paragraph(
          `VRV/VRF: rapporto di connessione ${((connected / vrvOutdoor.coolingW) * 100).toFixed(0)}% entro ${vrvOutdoor.minConnectionRatio}–${vrvOutdoor.maxConnectionRatio}%. Capacità nominale collegata ${(connected / 1000).toFixed(2)} kW. Le capacità per ambiente sono nominali; non si dichiara una capacità simultanea a carico parziale.`,
          9,
          muted,
        );
        table(
          [
            "Unità / ambiente",
            "Carico stanza kW",
            "Freddo nominale kW",
            "Caldo nominale kW",
          ],
          s.indoorUnits.map((d) => {
            const indoor = vrvIndoorAtVersion(d.productId, d.catalogVersion);
            return [
              `${data.codes.get(d.id)} - ${p.rooms.find((r) => r.id === d.roomId)?.name ?? d.roomId}`,
              n(
                (p.rooms.find((r) => r.id === d.roomId)?.designLoadW ?? 0) /
                  1000,
                3,
              ),
              indoor ? n(indoor.nominalCoolingW / 1000, 3) : "n.d.",
              indoor ? n(indoor.nominalHeatingW / 1000, 3) : "n.d.",
            ];
          }),
          [0.4, 0.2, 0.2, 0.2],
        );
      } else if (combination) {
        paragraph(
          `Combinazione ${combination.mode}; mercato fonte ${combination.region}. I codici e suffissi originali devono essere verificati per il mercato italiano prima dell'ordine.`,
          9,
          muted,
        );
        table(
          [
            "Unità / ambiente",
            "Carico stanza kW",
            "Freddo allocato kW",
            "Caldo allocato kW",
          ],
          s.indoorUnits.map((d, i) => [
            `${data.codes.get(d.id)} - ${p.rooms.find((r) => r.id === d.roomId)?.name ?? d.roomId}`,
            n(
              (p.rooms.find((r) => r.id === d.roomId)?.designLoadW ?? 0) / 1000,
              3,
            ),
            combination.indoorCoolingW[i] == null
              ? "n.d."
              : n(combination.indoorCoolingW[i] / 1000, 3),
            combination.indoorHeatingW[i] == null
              ? "n.d."
              : n(combination.indoorHeatingW[i] / 1000, 3),
          ]),
          [0.4, 0.2, 0.2, 0.2],
        );
      }
    }
    if (p.hydronicSystems?.length) {
      newPage("Pompe di calore e collegamenti idronici");
      for (const system of p.hydronicSystems) {
        const product = heatPumpProductAtVersion(
          system.productId,
          system.catalogVersion,
        );
        const point = product?.operatingPoints[system.operatingPointIndex];
        const capacity = point && heatPumpCapacity(point);
        heading(`${data.codes.get(system.id)} - ${system.name}`);
        paragraph(
          product
            ? `${product.manufacturer} ${product.family} ${product.model}; versione ${system.catalogVersion}. ${product.dimensionNote}`
            : `Modello ${system.productId}; revisione ${system.catalogVersion} non disponibile.`,
          9,
        );
        table(
          [
            "Punto operativo",
            "Caldo / freddo",
            "Condizioni dichiarate",
            "COP / EER dichiarati",
          ],
          [
            [
              point?.label ?? "Non verificabile",
              capacity
                ? `${n(capacity.heatingW)} / ${n(capacity.coolingW)} W; potenze ${capacity.basis}`
                : "Non dichiarati",
              point
                ? `Caldo: ${point.heatingConditions}; freddo: ${point.coolingConditions}`
                : "Non documentate",
              point
                ? `${point.cop === null ? "n.d." : n(point.cop)} / ${point.eer === null ? "n.d." : n(point.eer)}`
                : "n.d.",
            ],
          ],
          [0.2, 0.2, 0.45, 0.15],
        );
        const outdoor = system.outdoorUnit;
        paragraph(
          `Unita esterna ${data.codes.get(outdoor.id)}: piano ${p.floors.find((floor) => floor.id === outdoor.floorId)?.name}; X ${n(outdoor.position.x)}, Y ${n(outdoor.position.y)}, quota ${n(outdoor.elevationM)} m; rotazione ${n((outdoor.rotation * 180) / Math.PI, 0)} gradi; ingombro ${n(outdoor.widthMm)} x ${n(outdoor.heightMm)} x ${n(outdoor.depthMm)} mm.`,
          9,
        );
        paragraph(
          `Ambienti serviti: ${p.rooms
            .filter((room) => system.roomIds.includes(room.id))
            .map((room) => room.name)
            .join(
              ", ",
            )}. Ventilconvettori collegati: ${system.fanCoilIds.map((id) => data.codes.get(id) ?? id).join(", ") || "nessuno"}.`,
          9,
        );
        paragraph(
          "Il collegamento identifica gli apparecchi del circuito. Compatibilita delle temperature acqua, portata idraulica, accumuli e perdite di carico richiedono verifica; le potenze di targa a condizioni differenti non provano da sole la copertura del circuito.",
          8,
          muted,
        );
        if (system.pipeWaypoints?.length)
          table(
            ["Ventilconvettore", "Percorso salvato X / Y m"],
            system.pipeWaypoints.map((route) => [
              data.codes.get(route.fanCoilId) ?? route.fanCoilId,
              route.points
                .map((position) => `${n(position.x)} / ${n(position.y)}`)
                .join("; "),
            ]),
            [0.25, 0.75],
          );
      }
    }
    newPage("Distinta materiali - senza prezzi");
    table(
      [
        "Descrizione",
        "Codice",
        "Quantità",
        "Dimensioni",
        "Caratteristiche",
        "Locali",
      ],
      [...data.materials, ...data.accessories].map((m) => [
        `${m.description}${m.sku ? `; Codice articolo ${m.sku}` : ""}`,
        m.codes.join(", "),
        quantityText(m),
        m.dimensions ?? "",
        m.details,
        m.locales.join(", "),
      ]),
      [0.22, 0.12, 0.12, 0.17, 0.25, 0.12],
    );
    paragraph(
      "La distinta comprende gli apparecchi configurati e, per ogni radiatore, staffe di sostegno, valvola, detentore e kit copritubo derivati dalle finiture scelte; per i radiatori la quantità è in elementi e tra parentesi è indicato il numero di batterie. I codici articolo degli accessori non vengono generati dalla selezione grafica: verificarli sul listino del produttore. Attacchi, plenum, tubazioni, canalizzazioni e lavorazioni devono essere definiti nel progetto esecutivo. Le unità interne elencate separatamente sono incluse nel rispettivo sistema, senza sommare due volte il kit.",
      9,
      muted,
    );
    newPage("Controlli del progetto");
    table(
      ["Esito", "Codice", "Verifica"],
      data.checks.map((c) => [
        c.status === "valid"
          ? "OK"
          : c.status === "invalid"
            ? "ERRORE"
            : "AVVISO",
        c.code,
        c.message,
      ]),
      [0.13, 0.21, 0.66],
    );
    if (data.unresolved.length) {
      heading("Provenienze storiche mancanti");
      data.unresolved.forEach((s) => paragraph(s, 9));
    }
    newPage("Provenienze e versioni");
    if (data.dataQuality.length) {
      heading("Stato dei dati dei terminali");
      for (const quality of data.dataQuality)
        paragraph(
          `${quality.code}: Prestazioni — ${quality.performance}. Geometria — ${quality.geometry}. Prezzo — ${quality.price}.`,
          9,
        );
    }
    paragraph(
      `Progetto ${p.id}; schema ${p.schemaVersion}. Versioni registrate: ${
        Object.entries(p.catalogVersions)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ") || "nessuna"
      }.`,
      9,
    );
    for (const [i, source] of data.sources.entries()) {
      const metadata = `${source.sourceType.toUpperCase()}; revisione ${source.documentRevision ?? "non indicata"}; pagina ${source.page ?? "non indicata"}. Acquisita ${source.retrievedAt ?? "data non registrata nella fonte acquisita"}; importata ${source.importedAt}.`;
      ensure(
        52 +
          wrap(metadata, usable, 9).length * 13.5 +
          9 +
          wrap(source.sourceUrl, usable, 8).length * 12 +
          9 +
          21,
      );
      heading(`Fonte ${i + 1} - ${source.manufacturer}`);
      paragraph(metadata, 9);
      paragraph(source.sourceUrl, 8, blue);
      paragraph(`SHA-256: ${source.sha256}`, 8, muted);
    }
    if (!data.sources.length)
      paragraph(
        "Nessun apparecchio con fonte tecnica risolta nella versione corrente del progetto.",
      );
    if (p.hvacSystems.some((system) => system.type === "ducted")) {
      ensure(
        52 +
          PLENUM_SOURCES.reduce(
            (sum, source) =>
              sum +
              wrap(`${source.title}. ${source.description}`, usable, 8).length *
                12 +
              wrap(source.url, usable, 8).length * 12 +
              18,
            0,
          ),
      );
      heading("Criteri di confronto degli stacchi");
      for (const source of PLENUM_SOURCES) {
        ensure(
          35 +
            wrap(`${source.title}. ${source.description}`, usable, 8).length *
              12 +
            wrap(source.url, usable, 8).length * 12,
        );
        paragraph(`${source.title}. ${source.description}`, 8, muted);
        paragraph(source.url, 8, blue);
      }
    }
    if (p.sourceFilesMetadata.length) {
      heading("File di planimetria importati");
      table(
        ["File", "Formato / dimensione", "Importazione"],
        p.sourceFilesMetadata.map((s) => [
          s.filename,
          `${s.sourceType}; ${s.sizeBytes} byte`,
          s.importedAt,
        ]),
        [0.42, 0.28, 0.3],
      );
    }
    const separatePlenums = p.plenums.filter(
      (pl) => pl.attachmentId !== undefined,
    );
    if (separatePlenums.length) {
      newPage("Plenum collegati");
      table(
        ["Elemento", "Collegato a", "Dimensioni (mm)", "Stacchi / quota"],
        separatePlenums.map((pl) => [
          `${data.codes.get(pl.id)} - ${pl.model ?? "Plenum"}`,
          `${pl.use === "supply" ? "Mandata" : "Ripresa"}; ${pl.attachmentId ? (data.codes.get(pl.attachmentId) ?? "elemento") : "da collegare"}`,
          `${n(pl.widthMm)} x ${n(pl.heightMm)} x ${n(pl.depthMm)}`,
          `${pl.portCount ?? 1} x diam. ${pl.portDiameterMm ?? 160} mm; quota ${n(pl.elevationM ?? 0)} m`,
        ]),
        [0.25, 0.25, 0.25, 0.25],
      );
    }
    for (const system of p.hvacSystems.filter(
      (s) =>
        s.type === "ducted" &&
        !separatePlenums.some((pl) => pl.systemId === s.id),
    )) {
      const plenum = calculateSupplyPlenum(p, system.id);
      const machineName = `${data.codes.get(system.id)} · ${system.manufacturer} ${plenum.machineModel ?? system.productId}`;
      newPage(
        `Plenum mandata - ${data.codes.get(system.id) ?? ""} ${
          system.name ||
          p.rooms
            .filter((r) => system.roomIds.includes(r.id))
            .map((r) => r.name)
            .join(", ")
        }`,
      );
      paragraph(
        `Macchina: ${machineName}. ${plenum.branches.length} stacchi di mandata; ripresa separata: ${plenum.returnTerminalCount} bocchette. Stato: ${plenum.status === "ready" ? "dati mandata e ripresa completi" : "configurazione da completare"}.`,
      );
      const placed = p.plenums.find(
        (pl) => pl.systemId === system.id && pl.use === "supply",
      );
      const actualGeometry = placed
        ? placedPlenumGeometry(p, placed)
        : plenum.machineGeometry;
      const machine = system.indoorUnits[0];
      paragraph(
        placed
          ? `Plenum ${data.codes.get(placed.id)} - ${placed.model ?? "su misura"}; dimensioni scelte ${n(placed.widthMm, 0)} x ${n(placed.heightMm, 0)} x ${n(placed.depthMm, 0)} mm. Posizione X ${n(placed.position.x)}, Y ${n(placed.position.y)}, quota ${n(placed.elevationM ?? 0)} m, orientamento ${n((placed.rotation * 180) / Math.PI, 0)} gradi. Macchina dedicata ${data.codes.get(system.id)}${machine ? `; posizione X ${n(machine.position.x)}, Y ${n(machine.position.y)} m` : "; posizione macchina da inserire"}.`
          : "Plenum non ancora posizionato: vista della proposta geometrica, da confermare dall'operatore.",
        9,
      );
      if (actualGeometry?.inlet) {
        const inlet = actualGeometry.inlet;
        paragraph(
          `Raccordo macchina ${n(inlet.connectionWidthMm, 0)} x ${n(inlet.connectionHeightMm, 0)} mm (${inlet.dimensionBasis === "flangeMountingSpan" ? "interasse montaggio flangia" : "apertura canale"}); luce interna ${inlet.clearOpeningWidthMm === null || inlet.clearOpeningHeightMm === null ? "non pubblicata: da verificare" : `${n(inlet.clearOpeningWidthMm, 0)} x ${n(inlet.clearOpeningHeightMm, 0)} mm`}. Transizione ${actualGeometry.transitionDepthMm === null ? "n.d." : n(actualGeometry.transitionDepthMm, 0)} mm; corpo ${actualGeometry.boxDepthMm === null ? "n.d." : n(actualGeometry.boxDepthMm, 0)} mm; collari ${n(actualGeometry.settings.collarLengthMm, 0)} mm. Quote di fabbricazione proposte; spessore lamiera e isolamento non dichiarati.`,
          9,
        );
        paragraph(
          `Riferimento attacco: ${inlet.drawingReference}. ${inlet.conditions}${inlet.sourceMetadata ? ` Fonte: ${inlet.sourceMetadata.sourceUrl}; pagina ${inlet.sourceMetadata.page ?? "n.d."}.` : " Quote inserite dall'operatore."}`,
          8,
          muted,
        );
        table(
          [
            "Attacco",
            "Bocchette collegate",
            "Centro X / H / Z mm",
            "Diametro / collare mm",
          ],
          actualGeometry.ports.map((port) => [
            `${port.number}`,
            port.branch.terminalIds
              .map((id) => data.codes.get(id) ?? id)
              .join(", "),
            port.centerMm.map((value) => n(value, 0)).join(" / "),
            `${n(port.diameterMm, 0)} / ${n(port.collarLengthMm, 0)}`,
          ]),
          [0.12, 0.29, 0.34, 0.25],
        );
        paragraph(
          "Coordinate attacchi relative al centro del raccordo macchina: X orizzontale, H verticale, Z nel verso della mandata. Diametri nominali; diametro interno effettivo da confermare sul componente ordinato.",
          8,
          muted,
        );
      }
      for (const view of ["isometric", "top", "front"] as const) {
        const drawing = plenumTechnicalDrawing(p, system.id, view);
        if (!drawing) {
          if (view === "isometric")
            paragraph(
              "Vista 3D plenum non disponibile: mancano dimensioni o attacchi verificati. Nessuna geometria sostitutiva inventata.",
              10,
              muted,
            );
          continue;
        }
        const blockHeight = view === "isometric" ? 230 : 170;
        ensure(blockHeight + 65, "Plenum - viste tecniche");
        heading(
          view === "isometric"
            ? "Vista 3D isometrica del plenum"
            : view === "front"
              ? "Vista frontale - tutti gli attacchi"
              : "Vista tecnica dall'alto",
        );
        drawTechnical(drawing, blockHeight, machineName);
        paragraph(
          `${drawing.portCount} attacchi disegnati / ${plenum.branches.length} richiesti. Numerazione corrispondente alla legenda e al modello 3D; attacchi senza dati non ricevono diametri inventati.`,
          9,
          muted,
        );
      }
      paragraph(
        `Criterio di confronto: velocita ${n(plenum.settings.maxBranchVelocityMs)} m/s; Q/3600 = v x pi x D²/4. Numero e diametri degli stacchi provengono dagli attacchi documentati della bocchetta o del suo plenum: una bocchetta puo avere piu stacchi. I diametri originali non vengono aumentati automaticamente; il minimo teorico serve alla verifica della velocita.`,
        9,
        muted,
      );
      if (plenum.branches.length) {
        for (let offset = 0; offset < plenum.branches.length; offset += 12) {
          const diagramBranches = plenum.branches.slice(offset, offset + 12);
          const columns = Math.min(4, diagramBranches.length);
          const rows = Math.ceil(diagramBranches.length / columns);
          const machineWidth = usable * 0.4;
          const machineLines = wrap(machineName, machineWidth - 20, 8.2, bold);
          const barHeight = Math.max(38, machineLines.length * 11 + 14);
          const blockHeight = barHeight + 30 + rows * 92;
          ensure(blockHeight, "Plenum - schema stacchi");
          const graphTop = y;
          page.drawRectangle({
            x: margin,
            y: graphTop - barHeight,
            width: machineWidth,
            height: barHeight,
            color: pale,
            borderColor: blue,
            borderWidth: 0.6,
          });
          machineLines.forEach((text, index) =>
            centered(
              text,
              margin + machineWidth / 2,
              graphTop -
                barHeight / 2 +
                (machineLines.length - 1) * 5.5 -
                3 -
                index * 11,
              8.2,
              bold,
              blue,
            ),
          );
          page.drawLine({
            start: {
              x: margin + machineWidth + 8,
              y: graphTop - barHeight / 2,
            },
            end: { x: margin + machineWidth + 28, y: graphTop - barHeight / 2 },
            color: cyan,
            thickness: 1.5,
          });
          page.drawRectangle({
            x: margin + machineWidth + 36,
            y: graphTop - barHeight,
            width: usable - machineWidth - 36,
            height: barHeight,
            color: pale,
            borderColor: cyan,
            borderWidth: 0.6,
          });
          centered(
            actualGeometry?.bodyWidthMm
              ? `PLENUM ${actualGeometry.bodyWidthMm}x${actualGeometry.bodyHeightMm}x${actualGeometry.totalDepthMm} mm`
              : "ATTACCO DA SPECIFICARE",
            margin + (usable + machineWidth + 36) / 2,
            graphTop - barHeight / 2 - 3,
            9,
            bold,
            blue,
          );
          const scale =
            24 / Math.max(63, ...plenum.branches.map((b) => b.diameterMm ?? 0));
          diagramBranches.forEach((branch, i) => {
            const x = margin + (usable / columns) * ((i % columns) + 0.5);
            const yy = graphTop - barHeight - 36 - Math.floor(i / columns) * 92;
            const radius =
              branch.diameterMm === null ? 14 : branch.diameterMm * scale;
            page.drawCircle({
              x,
              y: yy,
              size: radius,
              color: pale,
              borderColor: branch.verified ? cyan : muted,
              borderWidth: 1,
            });
            centered(String(offset + i + 1), x, yy - 3, 9, bold, blue);
            centered(
              branch.diameterMm === null
                ? "Ø da verificare"
                : `Ø ${branch.diameterMm} mm`,
              x,
              yy - 39,
              9,
              bold,
            );
            centered(
              `${n(branch.airflowM3h)} m³/h`,
              x,
              yy - 53,
              8,
              font,
              muted,
            );
            centered(
              branch.roomName.length > 22
                ? branch.roomName.slice(0, 21) + "…"
                : branch.roomName,
              x,
              yy - 67,
              8,
              font,
              muted,
            );
          });
          y -= blockHeight;
          paragraph(
            "Cerchi proporzionali ai diametri nominali. Corpo e transizione quotati sul raccordo macchina documentato. Verificare luce libera, flangia e percorsi prima della fabbricazione.",
            8,
            muted,
          );
        }
        table(
          [
            "Stacco / ambiente / bocchette",
            "Portata",
            "Ø nominale / teorico mm",
            "Velocita / esito",
          ],
          plenum.branches.map((b, i) => [
            `${i + 1}. ${b.roomName}; ${b.terminalIds.map((id) => data.codes.get(id) ?? id).join(", ")}; ${b.terminalModels.join(" / ")}`,
            `${n(b.airflowM3h)} m³/h`,
            b.diameterMm === null
              ? "Da verificare"
              : `${b.diameterMm} / ${b.minimumDiameterMm === null ? "n.d." : n(b.minimumDiameterMm, 0)}`,
            b.velocityMs === null
              ? "-"
              : `${n(b.velocityMs)} m/s; ${b.velocityMs > plenum.settings.maxBranchVelocityMs ? "oltre criterio" : "entro criterio"}`,
          ]),
          [0.4, 0.2, 0.2, 0.2],
        );
      }
      if (plenum.issues.length)
        paragraph(
          plenum.issues.map((issue) => issue.message).join(" "),
          9,
          muted,
        );
      paragraph(
        `Mandata: ${n(plenum.supplyAirflowM3h)} m³/h; ripresa: ${n(plenum.returnAirflowM3h)} m³/h; macchina: ${plenum.machineAirflowM3h === null ? "da verificare" : n(plenum.machineAirflowM3h) + " m³/h"}.`,
        9,
      );
      paragraph(
        "Fonti dei criteri di confronto: sezione Provenienze e versioni.",
        8,
        muted,
      );
    }
    if (p.ducts?.length) {
      newPage("Canalizzazione collegata - percorsi di progetto");
      paragraph(
        "Percorsi geometrici proposti o modificati dall'operatore. Perdite di carico, pezzi speciali, sostegni e verifica esecutiva non sono dedotti dalla lunghezza del percorso.",
        9,
        muted,
      );
      table(
        ["Canale / sistema", "Collegamenti", "Sezione", "Lunghezza / origine"],
        p.ducts.map((d) => {
          const length = ductLength(
            ductRoute(p, d),
            d.kind === "flexible" ? (d.diameterMm ?? 160) : undefined,
            d.flexibleProductId,
          );
          return [
            data.codes.get(d.id) ?? d.id,
            `${data.codes.get(d.systemId)} / ${data.codes.get(d.plenumId)} -> ${d.terminalId ? data.codes.get(d.terminalId) : "macchina"}`,
            d.shape === "circle"
              ? `Ø ${n(d.diameterMm ?? 0)} mm`
              : `${n(d.widthMm ?? 0)} x ${n(d.heightMm ?? 0)} mm`,
            `${length === null ? "Da correggere" : `${n(length)} m`} / ${d.decisionOrigin}`,
          ];
        }),
        [0.18, 0.34, 0.2, 0.28],
      );
    }
    heading("Nota tecnica");
    paragraph(TECHNICAL_NOTE, 9);
  }
  if ((options.includePrices ?? !isSummary) && p.airTerminals.length) {
    const bill = calculateEcoclimaBom(p);
    const currency = (cents: number) => `${n(cents / 100, 2)} EUR`;
    newPage("Listino materiali Ecoclima");
    paragraph(
      `Revisione ${bill.revision ?? "non indicata"}. Prezzi originali di listino, senza sconti; trattamento IVA da confermare sulla fonte.`,
      9,
    );
    table(
      ["Articolo / modello", "Dimensioni", "Quantità", "Listino", "Importo"],
      bill.lines.map((line) => [
        `${line.label}${line.sku ? ` (${line.sku})` : ""}${line.reason ? ` - ${line.reason}` : ""}`,
        line.dimensions ?? "Da verificare",
        line.quantity === null ? "Da verificare" : String(line.quantity),
        line.unitPriceCents === null
          ? "Da quotare"
          : currency(line.unitPriceCents),
        line.extendedPriceCents === null
          ? "Da completare"
          : currency(line.extendedPriceCents),
      ]),
      [0.42, 0.18, 0.1, 0.15, 0.15],
    );
    paragraph(
      bill.complete && bill.totalCents !== null
        ? `Totale: ${currency(bill.totalCents)}`
        : `Subtotale articoli con prezzo: ${currency(bill.knownSubtotalCents)}. ${bill.missingLineCount} voci da completare; totale completo non disponibile.`,
      11,
    );
    for (const source of [
      ...new Map(
        bill.lines
          .filter((line) => line.sourceMetadata)
          .map((line) => [
            line.sourceMetadata!.sourceUrl,
            line.sourceMetadata!,
          ]),
      ).values(),
    ])
      paragraph(
        `Fonte listino: ${source.sourceUrl}; acquisizione ${source.retrievedAt ?? "non registrata"}; SHA256 ${source.sha256}.`,
        8,
        muted,
      );
  }
  for (const panorama of options.renderImages ?? []) {
    if (panorama.mimeType !== "image/jpeg" || !panorama.bytes.byteLength)
      throw new Error("Immagine render del dossier non valida.");
    if (
      !p.floors.some((floor) => floor.id === panorama.floorId) ||
      (panorama.roomId &&
        !p.rooms.some(
          (room) =>
            room.id === panorama.roomId && room.floorId === panorama.floorId,
        ))
    )
      throw new Error(
        "Il render non appartiene a un piano o ambiente del progetto.",
      );
    let imageBytes = panorama.bytes;
    if (options.monochrome) {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(imageBytes)], { type: "image/jpeg" }),
      );
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Conversione in bianco e nero non disponibile.");
        context.filter = "grayscale(1)";
        context.drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: 0.91,
        });
        imageBytes = new Uint8Array(await blob.arrayBuffer());
      } finally {
        bitmap.close();
      }
    }
    const image = await doc.embedJpg(imageBytes);
    const landscapeWidth = 841.89,
      landscapeHeight = 595.28;
    page = doc.addPage([landscapeWidth, landscapeHeight]);
    page.drawRectangle({
      x: 0,
      y: landscapeHeight - 22,
      width: landscapeWidth,
      height: 22,
      color: band,
    });
    tracked("STAIANO HVAC", 42, landscapeHeight - 15, 6.6, bold, bandText, 1.1);
    const viewRight = "VISUALIZZAZIONE";
    tracked(
      viewRight,
      landscapeWidth - 42 - trackedWidth(viewRight, 6.6, bold, 1.1),
      landscapeHeight - 15,
      6.6,
      bold,
      navText,
      1.1,
    );
    const titleLines = wrap(panorama.title, landscapeWidth - 84, 18, bold);
    titleLines.forEach((line, index) =>
      txt(line, 42, landscapeHeight - 74 - index * 21, 18, bold, navy),
    );
    const imageMaxWidth = landscapeWidth - 84,
      imageMaxHeight = 405 - Math.max(0, titleLines.length - 2) * 22;
    const scale = Math.min(
      imageMaxWidth / image.width,
      imageMaxHeight / image.height,
    );
    const imageWidth = image.width * scale,
      imageHeight = image.height * scale;
    page.drawImage(image, {
      x: (landscapeWidth - imageWidth) / 2,
      y: 76 + (imageMaxHeight - imageHeight) / 2,
      width: imageWidth,
      height: imageHeight,
    });
    txt(
      isSummary
        ? "Render degli ambienti e degli impianti del progetto."
        : "Render della geometria di progetto. Finiture illustrative; muri e soffitti in sezione.",
      42,
      61,
      8,
      font,
      muted,
    );
    if (!isSummary)
      txt(
        "Visualizzazione orientativa: non sostituisce verifiche, quote e progetto esecutivo.",
        42,
        49,
        8,
        font,
        muted,
      );
  }
  const pages = doc.getPages();
  pages.forEach((v, i) => {
    if (v === coverPage) return;
    page = v;
    const { width: pw } = v.getSize(),
      edge = pw > 700 ? 56 : 46;
    v.drawLine({
      start: { x: edge, y: 44 },
      end: { x: pw - edge, y: 44 },
      color: line,
      thickness: 0.6,
    });
    const center = `${variantLabel} · ${date.toLocaleDateString("it-IT")}`;
    const projectWidth =
      (pw - font.widthOfTextAtSize(safe(center), 7)) / 2 - edge - 14;
    let projectName = safe(p.name);
    if (font.widthOfTextAtSize(projectName, 7) > projectWidth) {
      while (
        projectName &&
        font.widthOfTextAtSize(projectName + "...", 7) > projectWidth
      )
        projectName = projectName.slice(0, -1);
      projectName += "...";
    }
    txt(projectName, edge, 28, 7, font, muted);
    const label = `${i + 1} / ${pages.length}`;
    txt(label, pw - edge - bold.widthOfTextAtSize(label, 7), 28, 7, bold, navy);
    txt(
      center,
      (pw - font.widthOfTextAtSize(center, 7)) / 2,
      28,
      7,
      font,
      faint,
    );
  });
  if (coverPage) {
    page = coverPage;
    txt(String(pages.length), 306, coverPagesY, 9.5, bold, navy);
    const count = `${pages.length} pagine`;
    txt(
      count,
      width - 56 - bold.widthOfTextAtSize(count, 6.4),
      12,
      6.4,
      bold,
      navText,
    );
  }
  return doc.save();
}
