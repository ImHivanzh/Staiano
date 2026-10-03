import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { Project, Point } from "@/schemas/project";
import { buildDossier, TECHNICAL_NOTE } from "./dossier";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { ductedRoomAllocation } from "@/domain/ducted/apply";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";

const blue = rgb(0.212, 0.353, 0.659),
  cyan = rgb(0, 0.682, 0.937),
  green = rgb(0.329, 0.729, 0.318);
const ink = rgb(0.12, 0.16, 0.22),
  muted = rgb(0.38, 0.43, 0.49),
  pale = rgb(0.94, 0.96, 0.98);
const n = (v: number, decimals = 2) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimals }).format(v);
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
  options: { logoSvg?: string; generatedAt?: Date } = {},
): Promise<Uint8Array> {
  const data = buildDossier(project),
    p = data.project;
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const date = options.generatedAt ?? new Date();
  doc.setTitle(`Dossier tecnico - ${p.name}`);
  doc.setAuthor("Termoidraulica Staiano");
  doc.setSubject("Configurazione HVAC e dimensionamento convenzionale");
  doc.setCreationDate(date);
  let page!: PDFPage,
    y = 0;
  const margin = 42,
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
  const newPage = (title: string) => {
    page = doc.addPage([width, height]);
    y = height - 46;
    txt("STAIANO / DOSSIER TECNICO HVAC", margin, y, 9, bold, blue);
    y -= 29;
    for (const line of wrap(title, usable, 20, bold)) {
      txt(line, margin, y, 20, bold);
      y -= 25;
    }
    y -= 1;
  };
  const ensure = (needed: number, title = "Dossier tecnico - seguito") => {
    if (y - needed < 55) newPage(title);
  };
  const paragraph = (s: string, size = 10, color = ink) => {
    for (const line of wrap(s, usable, size)) {
      ensure(size + 5);
      txt(line, margin, y, size, font, color);
      y -= size + 5;
    }
    y -= 8;
  };
  const heading = (s: string) => {
    ensure(45);
    y -= 8;
    txt(s, margin, y, 13, bold, blue);
    y -= 22;
  };
  const table = (headers: string[], rows: string[][], fractions: number[]) => {
    const col = fractions.map((v) => v * usable),
      drawHeader = () => {
        const hh =
          Math.max(
            ...headers.map((h, i) => wrap(h, col[i] - 12, 9, bold).length),
          ) *
            12 +
          12;
        ensure(hh + 30);
        page.drawRectangle({
          x: margin,
          y: y - hh + 6,
          width: usable,
          height: hh,
          color: blue,
        });
        let x = margin;
        headers.forEach((h, i) => {
          wrap(h, col[i] - 12, 9, bold).forEach((l, k) =>
            txt(l, x + 6, y - 9 - k * 12, 9, bold, rgb(1, 1, 1)),
          );
          x += col[i];
        });
        y -= hh + 2;
      };
    drawHeader();
    rows.forEach((row, index) => {
      const lines = row.map((s, i) => wrap(s, col[i] - 12, 9));
      const count = Math.max(...lines.map((l) => l.length));
      let offset = 0;
      while (offset < count) {
        let available = Math.floor((y - 67) / 12);
        if (
          available < 1 ||
          (offset === 0 && count <= 40 && count > available)
        ) {
          newPage("Dossier tecnico - seguito");
          drawHeader();
          available = Math.floor((y - 67) / 12);
        }
        const take = Math.min(count - offset, available),
          hh = take * 12 + 12;
        if (index % 2 === 0)
          page.drawRectangle({
            x: margin,
            y: y - hh + 6,
            width: usable,
            height: hh,
            color: pale,
          });
        let x = margin;
        lines.forEach((ll, i) => {
          ll.slice(offset, offset + take).forEach((l, k) =>
            txt(l, x + 6, y - 9 - k * 12, 9),
          );
          x += col[i];
        });
        y -= hh;
        offset += take;
      }
    });
    y -= 14;
  };
  newPage("Configurazione impianto");
  if (options.logoSvg) {
    for (const match of options.logoSvg.matchAll(
      /<path\b[^>]*fill="(#[0-9a-fA-F]{6})"[^>]*d="([^"]+)"/g,
    )) {
      const c = match[1];
      page.drawSvgPath(match[2], {
        x: margin,
        y: y - 8,
        scale: 0.11,
        color: rgb(
          parseInt(c.slice(1, 3), 16) / 255,
          parseInt(c.slice(3, 5), 16) / 255,
          parseInt(c.slice(5, 7), 16) / 255,
        ),
      });
    }
    y -= 97;
  }
  paragraph(p.name, 24, blue);
  paragraph(
    `Elaborato il ${date.toLocaleDateString("it-IT")} - progetto aggiornato ${new Date(p.updatedAt).toLocaleString("it-IT")}`,
    9,
    muted,
  );
  table(
    ["Ambienti", "Superficie netta", "Volume netto", "Fabbisogno"],
    [
      [
        String(p.rooms.length),
        `${n(data.totals.areaM2)} m²`,
        `${n(data.totals.volumeM3)} m³`,
        `${n(data.totals.loadW / 1000, 3)} kW`,
      ],
    ],
    [0.18, 0.28, 0.27, 0.27],
  );
  paragraph(
    `${p.floors.length} piani; ${p.walls.length} muri; ${p.hvacSystems.length} sistemi HVAC; ${p.radiators.length} radiatori; ${p.airTerminals.length} terminali aria.`,
  );
  if (data.provisionalRooms.length)
    paragraph(
      `ATTENZIONE: ${data.provisionalRooms.length} ambienti con contorno aperto. Totali sopra riferiti solo agli ambienti chiusi. I dati precedenti degli ambienti aperti sono conservati per il recupero e non sono validabili.`,
      11,
      rgb(0.72, 0.22, 0.08),
    );
  const invalid = data.checks.filter((c) => c.status === "invalid").length,
    warnings = data.checks.filter((c) => c.status === "warning").length;
  heading(
    invalid ? "Elaborato con controlli non superati" : "Stato dei controlli",
  );
  paragraph(
    `${invalid} errori; ${warnings} avvisi. Il dossier riporta lo stato corrente del progetto, compresi dati mancanti e criticità.`,
  );
  heading("Metodo e limiti");
  paragraph(TECHNICAL_NOTE, 10);
  paragraph(
    "Superfici e volumi riferiti ai contorni netti interni dei muri. I disegni quotati rappresentano le geometrie del progetto; stampare al 100% per rispettare la scala indicata. Le misure numeriche prevalgono sulla misura a righello.",
    9,
    muted,
  );
  newPage("Riepilogo ambienti");
  table(
    ["Codice / stanza / piano", "Netta m²", "H m", "Volume m³", "Q kW / BTU/h"],
    p.rooms.map((r, i) => [
      `A${i + 1} - ${r.name || "Senza nome"}\n${p.floors.find((f) => f.id === r.floorId)?.name}`,
      r.geometryStatus === "unresolved" ? "Da ricalcolare" : n(r.netAreaM2),
      n(r.heightM),
      r.geometryStatus === "unresolved" ? "Da ricalcolare" : n(r.volumeM3),
      r.geometryStatus === "unresolved"
        ? "NON VALIDABILE"
        : `${n(r.designLoadW / 1000, 3)} / ${n(r.designLoadW * 3.412142, 0)}`,
    ]),
    [0.38, 0.13, 0.1, 0.17, 0.22],
  );
  for (const floor of p.floors) {
    page = doc.addPage([1190.55, 841.89]);
    y = 793;
    txt(`Planimetria - ${floor.name}`, 42, y, 21, bold, blue);
    y -= 22;
    txt(
      `Quota piano ${n(floor.elevationM)} m; scala ${floor.scaleVerified ? "verificata" : "NON VERIFICATA"}; quote muro all'asse, superfici stanza al netto`,
      42,
      y,
      9,
      font,
      muted,
    );
    const walls = p.walls.filter((w) => w.floorId === floor.id),
      rooms = p.rooms.filter((r) => r.floorId === floor.id);
    const points = [
      ...walls.flatMap((w) => [w.start, w.end]),
      ...rooms.flatMap((r) => r.polygon),
    ];
    if (!points.length) {
      txt("Piano privo di geometrie", 42, 700, 12);
      continue;
    }
    const minX = Math.min(...points.map((v) => v.x)),
      maxX = Math.max(...points.map((v) => v.x)),
      minY = Math.min(...points.map((v) => v.y)),
      maxY = Math.max(...points.map((v) => v.y));
    const box = { x: 62, y: 155, w: 1035, h: 545 },
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
        r.geometryStatus === "unresolved" ? rgb(1, 0.9, 0.75) : pale,
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
    const devices = [
      ...p.radiators.map((d) => ({ ...d, tint: blue })),
      ...p.airTerminals.map((d) => ({
        ...d,
        tint: d.use === "supply" ? cyan : green,
      })),
      ...p.hvacSystems.flatMap((s) =>
        s.indoorUnits.map((d) => ({ ...d, tint: rgb(0.55, 0.32, 0.68) })),
      ),
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
        "mounting" in d && (d.mounting === "unknown" || d.legacyUnverified);
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
          x: Math.min(1115 - tw, Math.max(48, at.x + Math.cos(angle) * radius)),
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
      const label = `W${p.walls.findIndex((v) => v.id === w.id) + 1} / ${n(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y))} m`,
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
      const at = px(r.centroid),
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
                ? "DA RICHIUDERE"
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
      42,
      113,
      9,
      font,
      muted,
    );
    const bar = Math.min(5, Math.max(1, Math.floor(box.w / ratio / 4)));
    page.drawLine({
      start: { x: 42, y: 90 },
      end: { x: 42 + bar * ratio, y: 90 },
      thickness: 2,
      color: ink,
    });
    txt(`${bar} m`, 42, 73, 9);
    txt(
      "A = ambiente; RAD = radiatore; M = mandata; R = ripresa; UI = unità interna",
      420,
      97,
      10,
      bold,
      blue,
    );
    txt(
      "Codici e quote completi nelle tabelle. Grigio: contorni netti; arancione: geometria precedente da richiudere; nero: muri.",
      420,
      79,
      9,
      font,
      muted,
    );
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
    heading("Quote dei muri all'asse");
    table(
      ["Muro", "Da x/y m", "A x/y m", "Lunghezza m", "Spessore m"],
      walls.map((w) => [
        `W${p.walls.findIndex((v) => v.id === w.id) + 1}`,
        `${n(w.start.x)} / ${n(w.start.y)}`,
        `${n(w.end.x)} / ${n(w.end.y)}`,
        n(Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)),
        n(w.thickness),
      ]),
      [0.12, 0.23, 0.23, 0.24, 0.18],
    );
  }
  for (const [index, r] of p.rooms.entries()) {
    newPage(`A${index + 1} - ${r.name || "Senza nome"}`);
    if (r.geometryStatus === "unresolved")
      paragraph(
        "CONTORNO APERTO - dimensioni, volume e carico sotto sono quelli dell'ultima configurazione chiusa. Non sono dati attuali validabili. Richiudere il contorno e riconfigurare gli apparecchi prima di usare il dossier.",
        11,
        rgb(0.72, 0.22, 0.08),
      );
    paragraph(
      `Piano: ${p.floors.find((f) => f.id === r.floorId)?.name}; impianto: ${{ none: "da definire", radiator: "radiatori", ducted: "canalizzato", split: "split" }[r.systemType]}`,
    );
    table(
      ["Superficie netta", "Perimetro", "Altezza", "Volume netto"],
      [
        [
          `${n(r.netAreaM2)} m²`,
          `${n(r.perimeterM)} m`,
          `${n(r.heightM)} m`,
          `${n(r.volumeM3)} m³`,
        ],
      ],
      [0.28, 0.24, 0.2, 0.28],
    );
    heading(
      r.geometryStatus === "unresolved"
        ? "Carico precedente - NON VALIDABILE"
        : "Fabbisogno convenzionale",
    );
    paragraph(
      `${n(r.netAreaM2, 4)} m² x ${n(r.heightM, 4)} m x 35 W/m³ = ${n(r.designLoadW, 2)} W = ${n(r.designLoadW / 1000, 3)} kW = ${n(r.designLoadW * 3.412142, 0)} BTU/h. Calcolo senza arrotondamenti intermedi; valori stampati arrotondati.`,
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
        [0.31, 0.24, 0.28, 0.17],
      );
      paragraph(
        "Rumore: riferimento del costruttore e punto operativo selezionato; limite configuratore 37 dB(A). Il valore non rappresenta una verifica acustica complessiva in ambiente. Le misure commerciali restano distinte dalla lunghezza teorica.",
        9,
        muted,
      );
    }
    const units = p.hvacSystems.flatMap((s) =>
      s.indoorUnits.filter((d) => d.roomId === r.id).map((d) => ({ s, d })),
    );
    if (units.length) {
      heading("Unità interne split");
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
    if (!rad.length && !air.length && !units.length)
      paragraph("Nessun apparecchio associato a questo ambiente.", 10, muted);
  }
  newPage("Sistemi HVAC");
  for (const s of p.hvacSystems) {
    const product = hvacProductAtVersion(s.productId, s.catalogVersion),
      combination =
        s.type === "split"
          ? splitCombinationAtVersion(s.productId, s.catalogVersion)
          : null,
      load = p.rooms
        .filter((r) => s.roomIds.includes(r.id))
        .reduce((sum, r) => sum + r.designLoadW, 0);
    heading(
      `${data.codes.get(s.id)} - ${s.manufacturer} ${s.type === "ducted" ? "canalizzato" : "split"}`,
    );
    paragraph(
      `Unità interna: ${combination ? s.indoorUnits.map((d) => splitIndoorAtVersion(d.productId, d.catalogVersion)?.model ?? d.productId).join(" + ") : (product?.indoorModel ?? s.productId)}; unità esterna: ${product?.outdoorModel ?? combination?.outdoorModel ?? "non verificabile"}. Stanze servite: ${p.rooms
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
          n(s.capacityW / 1000, 3),
          (product?.heatingCapacityW ?? combination?.heatingCapacityW)
            ? n(
                (product?.heatingCapacityW ?? combination?.heatingCapacityW)! /
                  1000,
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
      `Abbinamento: ${s.compatibilityStatus === "verified" ? "verificato su dati di catalogo" : "NON VERIFICATO"}. Versione ${s.catalogVersion}. ${product?.technicalNotes ?? combination?.notes ?? "Dati storici di catalogo non disponibili: verificare il sistema prima dell'ordine."}`,
      9,
    );
    if (combination) {
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
  if (!p.hvacSystems.length)
    paragraph("Nessun sistema split o canalizzato configurato.");
  newPage("Distinta materiali - senza prezzi");
  table(
    ["Quantità", "Materiale / codici", "Caratteristiche", "Locali"],
    data.materials.map((m) => [
      `${m.quantity} ${m.unit}`,
      `${m.description}; ${m.codes.join(", ")}`,
      m.details,
      m.locales.join(", "),
    ]),
    [0.12, 0.32, 0.4, 0.16],
  );
  paragraph(
    "La distinta comprende gli apparecchi configurati. Accessori, attacchi, valvole, plenum, tubazioni, canalizzazioni, sostegni e lavorazioni devono essere definiti nel progetto esecutivo. Le unità interne elencate separatamente sono incluse nel rispettivo sistema, senza sommare due volte il kit.",
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
  paragraph(
    `Progetto ${p.id}; schema ${p.schemaVersion}. Versioni registrate: ${
      Object.entries(p.catalogVersions)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ") || "nessuna"
    }.`,
    9,
  );
  for (const [i, source] of data.sources.entries()) {
    heading(`Fonte ${i + 1} - ${source.manufacturer}`);
    paragraph(
      `${source.sourceType.toUpperCase()}; revisione ${source.documentRevision ?? "non indicata"}; pagina ${source.page ?? "non indicata"}. Acquisita ${source.retrievedAt ?? "data non registrata nella fonte acquisita"}; importata ${source.importedAt}.`,
      9,
    );
    paragraph(source.sourceUrl, 8, blue);
    paragraph(`SHA-256: ${source.sha256}`, 8, muted);
  }
  if (!data.sources.length)
    paragraph(
      "Nessun apparecchio con fonte tecnica risolta nella versione corrente del progetto.",
    );
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
  heading("Nota tecnica");
  paragraph(TECHNICAL_NOTE, 9);
  const pages = doc.getPages();
  pages.forEach((v, i) => {
    page = v;
    const { width: pw } = v.getSize();
    v.drawLine({
      start: { x: 42, y: 42 },
      end: { x: pw - 42, y: 42 },
      color: pale,
      thickness: 1,
    });
    txt(`${p.name.slice(0, 65)} - STAIANO HVAC`, 42, 27, 8, font, muted);
    const label = `${i + 1} / ${pages.length}`;
    txt(label, pw - 42 - font.widthOfTextAtSize(label, 8), 27, 8, font, muted);
  });
  return doc.save();
}
