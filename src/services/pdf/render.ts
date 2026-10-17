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
import { calculateEcoclimaBom } from "@/domain/air-terminals/commercial-bom";
import { calculateSupplyPlenum, PLENUM_SOURCES } from "@/domain/ducted/plenum";
import {
  splitCombinationAtVersion,
  splitIndoorAtVersion,
} from "@/domain/catalogs/splits";
import type { ProjectPanorama } from "@/services/render3d/export";
import { plenumTechnicalDrawing } from "@/domain/ducted/technical-view";
import {
  roomMeasuredSides,
  wallMeasuredLength,
} from "@/domain/geometry/dimensions";
import { ductLength, ductRoute } from "@/domain/ducted/routes";
import { placedPlenumGeometry } from "@/domain/ducted/placement";
import {
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
  controllerBoardFor,
} from "@/domain/catalogs/fan-coils";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { wattsToBtuh } from "@/domain/thermal/calculate";

export type DossierRenderOptions = {
  variant?: "complete" | "summary";
  logoSvg?: string;
  generatedAt?: Date;
  renderImages?: readonly ProjectPanorama[];
};

const blue = rgb(0.212, 0.353, 0.659),
  cyan = rgb(0, 0.682, 0.937),
  green = rgb(0.329, 0.729, 0.318);
const ink = rgb(0.12, 0.16, 0.22),
  muted = rgb(0.38, 0.43, 0.49),
  pale = rgb(0.94, 0.96, 0.98);
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
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const date = options.generatedAt ?? new Date();
  doc.setTitle(
    `Dossier ${options.variant === "summary" ? "sintetico" : "tecnico"} - ${p.name}`,
  );
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
  const drawTechnical = (
    drawing: NonNullable<ReturnType<typeof plenumTechnicalDrawing>>,
    blockHeight: number,
  ) => {
    const scale = Math.min(
      (usable - 30) / (drawing.bounds.maxX - drawing.bounds.minX),
      (blockHeight - 20) / (drawing.bounds.maxY - drawing.bounds.minY),
    );
    const map = (point: [number, number]): [number, number] => [
      margin +
        (usable - (drawing.bounds.maxX - drawing.bounds.minX) * scale) / 2 +
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
        labelWidth = bold.widthOfTextAtSize(label.text, 8);
      page.drawRectangle({
        x: point[0] - labelWidth / 2 - 2,
        y: point[1] - 4,
        width: labelWidth + 4,
        height: 11,
        color: rgb(1, 1, 1),
      });
      txt(label.text, point[0] - labelWidth / 2, point[1] - 3, 8, bold, ink);
    }
    y -= blockHeight + 12;
  };
  newPage(
    options.variant === "summary"
      ? "Dossier sintetico"
      : "Configurazione impianto",
  );
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
  if (options.variant === "summary") {
    newPage("Ambienti e apparecchi scelti");
    paragraph(
      "Riepilogo della configurazione salvata. Calcoli convenzionali, suggerimenti automatici e apparecchi scelti restano distinti. Per planimetrie A3, percorsi, schede complete, listini e provenienze scaricare il dossier completo.",
      9,
      muted,
    );
    table(
      ["Ambiente", "Misure interne m", "Netta m² / volume m³", "Carico kW"],
      p.rooms.map((room) => {
        const sides = roomMeasuredSides(p, room, "internal");
        return [
          room.conditioningExclusion
            ? `${room.name} — non climatizzato: ${room.conditioningExclusion.reason}`
            : room.name,
          room.geometryStatus === "unresolved"
            ? "Contorno aperto"
            : sides
              ? `${n(sides.width)} x ${n(sides.length)}; H ${n(room.heightM)}`
              : `Irregolare; H ${n(room.heightM)}`,
          room.geometryStatus === "unresolved"
            ? "Da ricalcolare"
            : `${n(room.netAreaM2)} / ${n(room.volumeM3)}`,
          room.geometryStatus === "unresolved"
            ? "NON VALIDABILE"
            : n(room.designLoadW / 1000, 3),
        ];
      }),
      [0.3, 0.28, 0.25, 0.17],
    );
    if (data.materials.length || data.accessories.length) {
      heading("Distinta materiali");
      table(
        ["Descrizione / codici", "Quantità", "Dimensioni", "Caratteristiche"],
        [...data.materials, ...data.accessories].map((row) => [
          `${row.description}; ${row.codes.join(", ")}`,
          quantityText(row),
          row.dimensions ?? "",
          row.details,
        ]),
        [0.28, 0.14, 0.19, 0.39],
      );
    }
    for (const system of p.hydronicSystems ?? []) {
      const outdoor = system.outdoorUnit;
      const product = heatPumpProductAtVersion(
        system.productId,
        system.catalogVersion,
      );
      const point = product?.operatingPoints[system.operatingPointIndex];
      heading(`Pompa di calore ${data.codes.get(system.id)} - ${system.name}`);
      paragraph(
        `Unita esterna ${data.codes.get(outdoor.id)}: piano ${p.floors.find((floor) => floor.id === outdoor.floorId)?.name}; X ${n(outdoor.position.x)}, Y ${n(outdoor.position.y)}, quota ${n(outdoor.elevationM)} m. Ventilconvettori collegati: ${system.fanCoilIds.map((id) => data.codes.get(id) ?? id).join(", ") || "nessuno"}.`,
        9,
      );
      paragraph(
        point
          ? `Condizioni caldo: ${point.heatingConditions}; freddo: ${point.coolingConditions}. Le potenze della pompa e dei ventilconvettori a condizioni acqua differenti non provano la copertura del circuito.`
          : "Punto operativo storico non verificabile.",
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
            "Esito",
          ],
          data.linearBalances.map((balance) => [
            `${data.codes.get(balance.systemId)} ${balance.use === "supply" ? "mandata" : "ripresa"}; ${balance.familyCode}${balance.mixedModels ? "; modelli misti" : ""}`,
            `${n(balance.requiredM)} / ${n(balance.installedM)}`,
            `${n(balance.airflowM3h)} / ${n(balance.availableAirflowM3h)} m³/h`,
            balance.status === "deficit" ? "DEFICIT" : "sufficiente",
          ]),
          [0.32, 0.22, 0.3, 0.16],
        );
      else
        paragraph(
          "Nessun bilancio lineare disponibile per i sistemi canalizzati configurati.",
          9,
          muted,
        );
      paragraph(
        "Con modelli misti il riferimento dei metri richiesti non certifica gli altri modelli: verificare la capacita reale riportata. Una lunghezza richiesta non identifica una singola bocchetta. La composizione e la posa sono scelte dell'operatore.",
        8,
        muted,
      );
    }
    for (const system of ductedSystems) {
      const plenum = calculateSupplyPlenum(p, system.id);
      const placed = p.plenums.find(
        (candidate) => candidate.systemId === system.id,
      );
      const geometry = placed
        ? placedPlenumGeometry(p, placed)
        : plenum.machineGeometry;
      ensure(110);
      heading(
        `${data.codes.get(system.id)} - plenum ${placed ? data.codes.get(placed.id) : "proposto"}`,
      );
      paragraph(
        `Macchina ${plenum.machineModel ?? "non verificabile"}; ${plenum.branches.length} attacchi richiesti / ${geometry?.ports.length ?? 0} disegnabili. ${placed ? `Dimensioni scelte ${n(placed.widthMm)} x ${n(placed.heightMm)} x ${n(placed.depthMm)} mm; X ${n(placed.position.x)}, Y ${n(placed.position.y)}, quota ${n(placed.elevationM ?? 0)} m.` : "Plenum non ancora posizionato: proposta da confermare."}`,
        9,
      );
      const inlet = geometry?.inlet;
      paragraph(
        inlet?.clearOpeningWidthMm != null && inlet.clearOpeningHeightMm != null
          ? `Luce interna raccordo macchina: ${n(inlet.clearOpeningWidthMm)} x ${n(inlet.clearOpeningHeightMm)} mm.`
          : "Luce interna raccordo macchina non documentata: da verificare. Nessuna quota sostitutiva inventata.",
        8,
        muted,
      );
      for (const view of ["front", "isometric"] as const) {
        const drawing = plenumTechnicalDrawing(p, system.id, view);
        if (!drawing) {
          paragraph(
            "Vista plenum non disponibile: attacchi o quote non verificati.",
            9,
            muted,
          );
          break;
        }
        ensure(170, "Dossier sintetico - plenum");
        heading(
          view === "front"
            ? "Vista frontale - tutti gli attacchi"
            : "Vista 3D isometrica del plenum",
        );
        drawTechnical(drawing, 110);
      }
      table(
        [
          "Attacco / bocchette",
          "Ø nominale mm",
          "Portata m³/h",
          "Velocita m/s",
        ],
        plenum.branches.map((branch, index) => [
          `${index + 1} - ${branch.terminalIds.map((id) => data.codes.get(id) ?? id).join(", ")}`,
          branch.diameterMm === null ? "Da verificare" : n(branch.diameterMm),
          n(branch.airflowM3h),
          branch.velocityMs === null
            ? "n.d."
            : `${n(branch.velocityMs)}${branch.velocityMs > plenum.settings.maxBranchVelocityMs ? "; oltre criterio" : ""}`,
        ]),
        [0.35, 0.22, 0.23, 0.2],
      );
      for (const issue of [
        ...plenum.issues.map((item) => item.message),
        ...(geometry?.issues ?? []),
      ])
        paragraph(issue, 8, muted);
    }
    newPage("Anomalie e limiti del riepilogo");
    const detailed = data.checks.filter(
      (check) =>
        check.status === "invalid" ||
        (check.status === "warning" &&
          /linearMeters|connection|plenum|hydronic/i.test(check.code)),
    );
    if (detailed.length)
      table(
        ["Esito", "Codice", "Verifica"],
        detailed.map((check) => [
          check.status === "invalid" ? "ERRORE" : "AVVISO",
          check.code,
          check.message,
        ]),
        [0.14, 0.23, 0.63],
      );
    else
      paragraph(
        "Nessun errore o avviso di collegamento nei controlli correnti.",
        9,
      );
    const grouped = new Map<string, number>();
    for (const check of data.checks.filter(
      (check) => check.status === "warning" && !detailed.includes(check),
    ))
      grouped.set(check.code, (grouped.get(check.code) ?? 0) + 1);
    if (grouped.size) {
      heading("Altri avvisi raggruppati");
      table(
        ["Tipo di avviso", "Numero"],
        [...grouped].map(([code, count]) => [code, String(count)]),
        [0.75, 0.25],
      );
      paragraph(
        "Gli avvisi raggruppati restano aperti. Leggere tutti i messaggi e le verifiche nel dossier completo prima dell'ordine o dell'esecuzione.",
        9,
        muted,
      );
    }
    for (const unresolved of data.unresolved) paragraph(unresolved, 9, muted);
    paragraph(
      `${data.sources.length} fonti tecniche risolte. Versioni: ${
        Object.entries(p.catalogVersions)
          .map(([key, version]) => `${key}: ${version}`)
          .join("; ") || "nessuna"
      }. URL, pagine e SHA-256 sono riportati nel dossier completo.`,
      8,
      muted,
    );
    paragraph(
      [
        "Quote ambienti interne.",
        ...(ductedSystems.length || p.hydronicSystems?.length
          ? [
              "Diametri stacchi nominali; dimensioni corpo, transizione e collari sono proposte di fabbricazione da verificare. Canalizzazioni e collegamenti idronici non includono una verifica delle perdite di carico.",
            ]
          : []),
      ].join(" "),
      8,
      muted,
    );
  } else {
    newPage("Riepilogo ambienti");
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
    for (const floor of p.floors) {
      page = doc.addPage([1190.55, 841.89]);
      y = 793;
      txt(`Planimetria - ${floor.name}`, 42, y, 21, bold, blue);
      y -= 22;
      txt(
        `Quota piano ${n(floor.elevationM)} m; scala ${floor.scaleVerified ? "verificata" : "NON VERIFICATA"}; quote interne utili, superfici stanza al netto`,
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
        ...(p.hydronicSystems ?? [])
          .filter((system) => system.outdoorUnit.floorId === floor.id)
          .map((system) => system.outdoorUnit.position),
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
          s.indoorUnits.map((d) => ({ ...d, tint: rgb(0.55, 0.32, 0.68) })),
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
              1115 - tw,
              Math.max(48, at.x + Math.cos(angle) * radius),
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
        "A = ambiente; RAD = radiatore; M/R = mandata/ripresa; UI = macchina; FC = ventilconvettore",
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
    for (const [index, r] of p.rooms.entries()) {
      newPage(`A${index + 1} - ${r.name || "Senza nome"}`);
      if (r.geometryStatus === "unresolved")
        paragraph(
          "CONTORNO APERTO - dimensioni, volume e carico sotto sono quelli dell'ultima configurazione chiusa. Non sono dati attuali validabili. Richiudere il contorno e riconfigurare gli apparecchi prima di usare il dossier.",
          11,
          rgb(0.72, 0.22, 0.08),
        );
      paragraph(
        `Piano: ${p.floors.find((f) => f.id === r.floorId)?.name}; impianto: ${{ none: "da definire", radiator: "radiatori", ducted: "canalizzato", split: "split", fanCoil: "ventilconvettori" }[r.systemType]}`,
      );
      if (r.conditioningExclusion)
        paragraph(
          `AMBIENTE NON CLIMATIZZATO — ${r.conditioningExclusion.reason}. Escluso dal fabbisogno da dimensionare; geometria e apparecchi conservati.`,
          11,
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
        r.conditioningExclusion
          ? "Carico da dimensionare: 0 W per esclusione esplicita dell’operatore."
          : `${n(r.netAreaM2, 4)} m² x ${n(r.heightM, 4)} m x 35 W/m³ = ${n(r.designLoadW, 2)} W = ${n(r.designLoadW / 1000, 3)} kW = ${n(wattsToBtuh(r.designLoadW), 0)} BTU/h. Calcolo senza arrotondamenti intermedi; valori stampati arrotondati.`,
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
          "Rumore: riferimento del costruttore e punto operativo selezionato; limite configuratore 37 dB(A) solo per la mandata. La ripresa si dimensiona sulla portata macchina. Il valore non rappresenta una verifica acustica complessiva in ambiente. Le misure commerciali restano distinte dalla lunghezza teorica.",
          9,
          muted,
        );
      }
      const units = p.hvacSystems.flatMap((s) =>
        s.indoorUnits.filter((d) => d.roomId === r.id).map((d) => ({ s, d })),
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
            const point = product?.operatingPoints[unit.operatingPointIndex];
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
          const point = product?.operatingPoints[unit.operatingPointIndex];
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
    if (p.hvacSystems.length) newPage("Sistemi HVAC");
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
            s.capacityW === null ? "Non dichiarata" : n(s.capacityW / 1000, 3),
            (product?.heatingCapacityW ?? combination?.heatingCapacityW)
              ? n(
                  (product?.heatingCapacityW ??
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
    if (p.hydronicSystems?.length) {
      newPage("Pompe di calore e collegamenti idronici");
      for (const system of p.hydronicSystems) {
        const product = heatPumpProductAtVersion(
          system.productId,
          system.catalogVersion,
        );
        const point = product?.operatingPoints[system.operatingPointIndex];
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
            "COP / EER",
          ],
          [
            [
              point?.label ?? "Non verificabile",
              point
                ? `${n(point.heatingW)} / ${n(point.coolingW)} W`
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
        "Descrizione / codici",
        "Quantità",
        "Dimensioni",
        "Caratteristiche",
        "Locali",
      ],
      [...data.materials, ...data.accessories].map((m) => [
        `${m.description}; ${m.codes.join(", ")}`,
        quantityText(m),
        m.dimensions ?? "",
        m.details,
        m.locales.join(", "),
      ]),
      [0.26, 0.14, 0.19, 0.27, 0.14],
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
    if (p.hvacSystems.some((system) => system.type === "ducted")) {
      heading("Criteri di confronto degli stacchi");
      for (const source of PLENUM_SOURCES) {
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
    for (const system of p.hvacSystems.filter((s) => s.type === "ducted")) {
      const plenum = calculateSupplyPlenum(p, system.id);
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
        `Macchina: ${plenum.machineModel ?? "catalogo da verificare"}. ${plenum.branches.length} stacchi di mandata; ripresa separata: ${plenum.returnTerminalCount} bocchette. Stato: ${plenum.status === "ready" ? "dati mandata e ripresa completi" : "configurazione da completare"}.`,
      );
      const placed = p.plenums.find((pl) => pl.systemId === system.id);
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
        drawTechnical(drawing, blockHeight);
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
          const blockHeight = 70 + rows * 92;
          ensure(blockHeight, "Plenum - schema stacchi");
          const graphTop = y;
          page.drawRectangle({
            x: margin,
            y: graphTop - 31,
            width: 105,
            height: 31,
            color: pale,
            borderColor: blue,
            borderWidth: 0.6,
          });
          txt("MACCHINA", margin + 12, graphTop - 20, 10, bold, blue);
          page.drawLine({
            start: { x: margin + 112, y: graphTop - 15 },
            end: { x: margin + 137, y: graphTop - 15 },
            color: cyan,
            thickness: 1.5,
          });
          page.drawRectangle({
            x: margin + 145,
            y: graphTop - 31,
            width: usable - 145,
            height: 31,
            color: pale,
            borderColor: cyan,
            borderWidth: 0.6,
          });
          txt(
            actualGeometry?.bodyWidthMm
              ? `PLENUM ${actualGeometry.bodyWidthMm}x${actualGeometry.bodyHeightMm}x${actualGeometry.totalDepthMm} mm`
              : "ATTACCO DA SPECIFICARE",
            margin + 158,
            graphTop - 20,
            10,
            bold,
            blue,
          );
          const scale =
            24 / Math.max(63, ...plenum.branches.map((b) => b.diameterMm ?? 0));
          diagramBranches.forEach((branch, i) => {
            const x = margin + (usable / columns) * ((i % columns) + 0.5);
            const yy = graphTop - 67 - Math.floor(i / columns) * 92;
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
            txt(String(offset + i + 1), x - 3, yy - 3, 9, bold, blue);
            txt(
              branch.diameterMm === null
                ? "Ø da verificare"
                : `Ø ${branch.diameterMm} mm`,
              x - 38,
              yy - 39,
              9,
              bold,
            );
            txt(
              `${n(branch.airflowM3h)} m³/h`,
              x - 29,
              yy - 53,
              8,
              font,
              muted,
            );
            txt(
              branch.roomName.length > 22
                ? branch.roomName.slice(0, 21) + "…"
                : branch.roomName,
              x - 40,
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
        p.ducts.map((d) => [
          data.codes.get(d.id) ?? d.id,
          `${data.codes.get(d.systemId)} / ${data.codes.get(d.plenumId)} -> ${d.terminalId ? data.codes.get(d.terminalId) : "macchina"}`,
          d.shape === "circle"
            ? `Ø ${n(d.diameterMm ?? 0)} mm`
            : `${n(d.widthMm ?? 0)} x ${n(d.heightMm ?? 0)} mm`,
          `${n(ductLength(ductRoute(p, d)))} m / ${d.decisionOrigin}`,
        ]),
        [0.18, 0.34, 0.2, 0.28],
      );
    }
    if (p.airTerminals.length) {
      const bill = calculateEcoclimaBom(p);
      const currency = (cents: number) => `${n(cents / 100, 2)} EUR`;
      newPage("Listino materiali Ecoclima");
      paragraph(
        `Revisione ${bill.revision ?? "non indicata"}. Prezzi originali di listino, senza sconti; trattamento IVA da confermare sulla fonte.`,
        9,
      );
      table(
        ["Articolo / modello", "Quantita", "Listino", "Importo"],
        bill.lines.map((line) => [
          `${line.label}${line.sku ? ` (${line.sku})` : ""}${line.reason ? ` - ${line.reason}` : ""}`,
          line.quantity === null ? "Da verificare" : String(line.quantity),
          line.unitPriceCents === null
            ? "Da quotare"
            : currency(line.unitPriceCents),
          line.extendedPriceCents === null
            ? "Da completare"
            : currency(line.extendedPriceCents),
        ]),
        [0.52, 0.12, 0.18, 0.18],
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
    heading("Nota tecnica");
    paragraph(TECHNICAL_NOTE, 9);
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
    const image = await doc.embedJpg(panorama.bytes);
    const landscapeWidth = 841.89,
      landscapeHeight = 595.28;
    page = doc.addPage([landscapeWidth, landscapeHeight]);
    txt(
      "STAIANO / VISUALIZZAZIONE DEL PROGETTO",
      42,
      landscapeHeight - 39,
      9,
      bold,
      blue,
    );
    const titleLines = wrap(panorama.title, landscapeWidth - 84, 18, bold);
    titleLines.forEach((line, index) =>
      txt(line, 42, landscapeHeight - 67 - index * 22, 18, bold),
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
      "Render della geometria di progetto. Finiture illustrative; muri e soffitti in sezione.",
      42,
      61,
      8,
      font,
      muted,
    );
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
