import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { parseDxf } from "./dxf";
import { extractPdfVectors } from "./pdf-vectors";
import { validatePlanFile } from "./plan-file";
import {
  applyPlanImport,
  calibrationScale,
  preparePlanImport,
} from "@/domain/geometry/import-plan";
import { createProject } from "@/domain/project";

const pairs = (data: (string | number)[]) => data.join("\n") + "\n";
function dxf(entities: (string | number)[], header: (string | number)[] = []) {
  return pairs([
    0,
    "SECTION",
    2,
    "HEADER",
    ...header,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
    ...entities,
    0,
    "ENDSEC",
    0,
    "EOF",
  ]);
}
const line = (layer: string, x: number, y: number, x2: number, y2: number) => [
  0,
  "LINE",
  8,
  layer,
  10,
  x,
  20,
  y,
  30,
  0,
  11,
  x2,
  21,
  y2,
  31,
  0,
];

describe("Importazione locale planimetrie", () => {
  it("DXF legge unità/layer, esclude lo spazio carta e non interpreta testi come muri", () => {
    const plan = parseDxf(
      dxf(
        [
          ...line("MURI", 0, 0, 4200, 0),
          ...line("QUOTE", 0, 0, 1, 1),
          0,
          "TEXT",
          8,
          "NOMI",
          10,
          100,
          20,
          100,
          1,
          "Soggiorno",
          40,
          30,
          0,
          "LINE",
          8,
          "CARTA",
          67,
          1,
          10,
          0,
          20,
          0,
          11,
          50,
          21,
          50,
        ],
        [9, "$INSUNITS", 70, 4],
      ),
    );
    expect(plan.suggestedMetersPerUnit).toBe(0.001);
    expect(plan.unitLabel).toBe("millimetri");
    expect(plan.segments).toHaveLength(2);
    expect(plan.annotations[0].text).toBe("Soggiorno");
    expect(plan.layers.map((l) => l.name)).toContain("MURI");
    expect(plan.warnings.some((w) => w.includes("carta"))).toBe(true);
  });
  it("DXF polilinea chiusa genera quattro muri e stanza calcolata con superfici nette", () => {
    const plan = parseDxf(
      dxf(
        [
          0,
          "LWPOLYLINE",
          8,
          "WALL",
          90,
          4,
          70,
          1,
          10,
          0,
          20,
          0,
          10,
          4.3,
          20,
          0,
          10,
          4.3,
          20,
          3.9,
          10,
          0,
          20,
          3.9,
        ],
        [9, "$INSUNITS", 70, 6],
      ),
    );
    const imported = preparePlanImport(plan, {
      selectedLayers: ["WALL"],
      excludedIds: [],
      metersPerUnit: 1,
      thicknessM: 0.1,
      convertGeometry: true,
      origin: { x: 0, y: 0 },
    });
    const project = createProject();
    const result = applyPlanImport(project, project.floors[0].id, imported);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].netAreaM2).toBeCloseTo(4.2 * 3.8, 7);
    expect(result.rooms[0].designLoadW).toBeCloseTo(4.2 * 3.8 * 3 * 37, 7);
    expect(result.sourceFilesMetadata[0].sourceType).toBe("dxf");
    expect(project.walls).toHaveLength(0);
  });
  it("DXF INSERT applica origine blocco, scala e rotazione senza leggere riferimenti esterni", () => {
    const source = pairs([
      0,
      "SECTION",
      2,
      "BLOCKS",
      0,
      "BLOCK",
      2,
      "B",
      10,
      10,
      20,
      20,
      30,
      0,
      ...line("0", 10, 20, 11, 20),
      0,
      "ENDBLK",
      0,
      "ENDSEC",
      0,
      "SECTION",
      2,
      "ENTITIES",
      0,
      "INSERT",
      8,
      "MURI",
      2,
      "B",
      10,
      100,
      20,
      200,
      41,
      2,
      42,
      3,
      50,
      90,
      0,
      "ENDSEC",
      0,
      "EOF",
    ]);
    const plan = parseDxf(source);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].layer).toBe("MURI");
    expect(plan.segments[0].start.x).toBeCloseTo(100);
    expect(plan.segments[0].start.y).toBeCloseTo(-200);
    expect(plan.segments[0].end.x).toBeCloseTo(100);
    expect(plan.segments[0].end.y).toBeCloseTo(-202);
  });
  it("Archi e bulge sono segmentati con avviso, senza falsi assi diritti", () => {
    const plan = parseDxf(
      dxf([
        0,
        "ARC",
        8,
        "ARCHI",
        10,
        0,
        20,
        0,
        40,
        1,
        50,
        0,
        51,
        90,
        0,
        "LWPOLYLINE",
        8,
        "CURVA",
        90,
        2,
        70,
        0,
        10,
        0,
        20,
        0,
        42,
        1,
        10,
        2,
        20,
        0,
      ]),
    );
    expect(plan.segments.length).toBeGreaterThan(20);
    expect(plan.warnings.some((w) => w.includes("Archi"))).toBe(true);
    expect(plan.segments[0].start.x).toBeCloseTo(1);
    expect(plan.segments[17].end.y).toBeCloseTo(-1);
  });
  it("Scelta layer e duplicati: importa solo geometrie selezionate, normalizzate a origine scelta", () => {
    const plan = parseDxf(
      dxf([
        ...line("M", 1000, 1000, 2000, 1000),
        ...line("M", 2000, 1000, 1000, 1000),
        ...line("Q", 0, 0, 9999, 0),
      ]),
    );
    const result = preparePlanImport(plan, {
      selectedLayers: ["M"],
      excludedIds: [],
      metersPerUnit: 0.001,
      thicknessM: 0.1,
      convertGeometry: true,
      origin: { x: 4, y: 5 },
    });
    expect(result.walls).toHaveLength(1);
    expect(result.walls[0]).toEqual({
      start: { x: 4, y: 5 },
      end: { x: 5, y: 5 },
    });
    expect(() =>
      preparePlanImport(plan, {
        selectedLayers: [],
        excludedIds: [],
        metersPerUnit: 1,
        thicknessM: 0.1,
        convertGeometry: true,
        origin: { x: 0, y: 0 },
      }),
    ).toThrow(/Selezionare/);
  });
  it("Calibrazione usa distanza euclidea; punti coincidenti e scala non valida sono rifiutati", () => {
    expect(calibrationScale({ x: 0, y: 0 }, { x: 814, y: 0 }, 4.23)).toBe(
      4.23 / 814,
    );
    expect(() => calibrationScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toThrow(
      /distinti/,
    );
    expect(() =>
      calibrationScale({ x: 0, y: 0 }, { x: 1, y: 0 }, NaN),
    ).toThrow();
  });
  it("DWG, MIME discordante, file vuoti e oversize producono errori operativi", () => {
    expect(
      validatePlanFile({
        name: "p.dwg",
        size: 100,
        type: "application/octet-stream",
      }),
    ).toBe("dwg");
    expect(() =>
      validatePlanFile({ name: "p.pdf", size: 100, type: "text/html" }),
    ).toThrow(/tipo file/);
    expect(() =>
      validatePlanFile({ name: "p.dxf", size: 0, type: "" }),
    ).toThrow(/vuoto/);
    expect(() =>
      validatePlanFile({
        name: "p.pdf",
        size: 34 * 1024 * 1024,
        type: "application/pdf",
      }),
    ).toThrow(/32 MB/);
    expect(() => parseDxf("AutoCAD Binary DXF")).toThrow(/ASCII/);
  });
  it("PDF vettoriale rispetta transform/save/restore e ignora i percorsi solo riempiti", () => {
    const ops = {
      save: 1,
      restore: 2,
      transform: 3,
      constructPath: 4,
      stroke: 5,
      fill: 6,
    };
    const result = extractPdfVectors(
      {
        fnArray: [1, 3, 4, 2, 4],
        argsArray: [
          [],
          [2, 0, 0, 2, 10, 20],
          [5, [new Float32Array([0, 0, 0, 1, 4, 0, 1, 4, 3, 4])], [0, 4, 0, 3]],
          [],
          [6, [new Float32Array([0, 0, 0, 1, 4, 0])], [0, 4, 0, 0]],
        ],
      },
      ops,
      [1, 0, 0, -1, 0, 100],
    );
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].start).toEqual({ x: 10, y: 80 });
    expect(result.segments[0].end).toEqual({ x: 18, y: 80 });
  });
  it("PDF reale pdf-lib viene letto da PDF.js e produce quattro segmenti allineati alla pagina", async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([600, 800]);
    page.drawRectangle({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      borderWidth: 2,
      borderColor: rgb(0, 0, 0),
    });
    const bytes = await document.save();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: bytes });
    try {
      const pdf = await task.promise;
      const original = await pdf.getPage(1);
      const op = await original.getOperatorList();
      const vectors = extractPdfVectors(
        op,
        pdfjs.OPS,
        original.getViewport({ scale: 1 }).transform,
      );
      expect(vectors.segments).toHaveLength(4);
      expect(
        vectors.segments.some((s) => s.start.x === 100 && s.start.y === 700),
      ).toBe(true);
    } finally {
      await task.destroy();
    }
  });
});
