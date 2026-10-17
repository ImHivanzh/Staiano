import { describe, expect, it } from "vitest";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { createProject } from "@/domain/project";
import { buildDossier, TECHNICAL_NOTE } from "./dossier";
import { renderDossierPdf } from "./render";
import { dossierFixture } from "./fixture";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";

describe("Dossier tecnico locale", () => {
  it("aggiunge una pagina panoramica con JPEG incorporato e mantiene il dossier completo", async () => {
    const p = dossierFixture();
    // Original local JPEG proves PDF image embedding; real GPU capture is browser-verified.
    const imageBytes = new Uint8Array(
      await readFile(
        new URL(
          "../../../public/materials3d/stone/basecolor.jpg",
          import.meta.url,
        ),
      ),
    );
    const baseline = await PDFDocument.load(await renderDossierPdf(p));
    const doc = await PDFDocument.load(
      await renderDossierPdf(p, {
        renderImages: [
          {
            title: "Piano - immagine di verifica",
            floorId: p.floors[0].id,
            bytes: imageBytes,
            mimeType: "image/jpeg",
            width: 1024,
            height: 1024,
          },
        ],
      }),
    );
    expect(doc.getPageCount()).toBe(baseline.getPageCount() + 1);
    const renderPage = doc.getPage(doc.getPageCount() - 1);
    expect(renderPage.getWidth()).toBeCloseTo(841.89, 2);
    expect(renderPage.getHeight()).toBeCloseTo(595.28, 2);
    const images = renderPage.node
      .Resources()!
      .lookup(PDFName.of("XObject"), PDFDict);
    expect(images.values()).toHaveLength(1);
    const image = doc.context.lookup(images.values()[0]);
    if (!(image instanceof PDFRawStream))
      throw new Error("JPEG stream mancante");
    expect(image.dict.get(PDFName.of("Subtype"))).toEqual(PDFName.of("Image"));
    expect(image.dict.get(PDFName.of("Filter"))).toEqual(
      PDFName.of("DCTDecode"),
    );
    expect(image.contents.byteLength).toBe(imageBytes.byteLength);
  });
  it("renderizza facce circolari reali e posa legacy ignota senza inventare profondità", async () => {
    let p = dossierFixture();
    const room = p.rooms.find((r) => r.systemType === "ducted")!;
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === "EVVMC",
    )!;
    room.supplyPoints = 1;
    const solution = sizeAirTerminal(720, 1, family, "supply")[0];
    expect(solution).toBeDefined();
    p = applyAirTerminalSolution(
      p,
      room.id,
      p.hvacSystems[0].id,
      "supply",
      family.familyCode,
      solution,
      "ceiling",
    );
    expect(
      p.airTerminals
        .filter((t) => t.use === "supply")
        .every((t) => t.shape === "circle" && t.depthMm === null),
    ).toBe(true);
    const terminal = p.airTerminals[0];
    terminal.mounting = "unknown";
    terminal.shape = "unknown";
    terminal.elevationM = null;
    terminal.operatingPointIndex = null;
    terminal.legacyUnverified = true;
    const doc = await PDFDocument.load(await renderDossierPdf(p));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(9);
    expect(
      buildDossier(p).checks.some((check) => check.code === "terminalLegacy"),
    ).toBe(true);
  });
  it("usa somme senza arrotondamento, fonti originali e codici univoci", () => {
    const p = dossierFixture(),
      d = buildDossier(p);
    expect(d.totals.loadW).toBe(
      p.rooms.reduce((sum, r) => sum + r.netAreaM2 * r.heightM * 35, 0),
    );
    expect(new Set([...d.codes.values()]).size).toBe(d.codes.size);
    expect(d.sources.length).toBeGreaterThanOrEqual(4);
    expect(d.unresolved).toEqual([]);
    expect(d.materials.reduce((sum, m) => sum + m.pieces, 0)).toBe(
      p.radiators.length + p.airTerminals.length + p.hvacSystems.length,
    );
    expect(TECHNICAL_NOTE).toContain("Non sostituisce");
    expect(TECHNICAL_NOTE).toContain(
      "tecnico qualificato prima dell’esecuzione",
    );
    expect(d.materials.every((row) => row.locales.length > 0)).toBe(true);
  });
  it("elenca staffe, valvola, detentore e kit copritubo di ogni radiatore nella distinta", () => {
    const p = dossierFixture(),
      d = buildDossier(p);
    expect(p.radiators.length).toBeGreaterThan(0);
    for (const noun of [
      "Staffe di sostegno",
      "Valvola",
      "Detentore",
      "Kit copritubo",
    ]) {
      const rows = d.accessories.filter((row) =>
        row.description.startsWith(`${noun} `),
      );
      expect(rows, `accessorio ${noun} una sola riga per modello`).toHaveLength(
        1,
      );
      expect(rows[0].quantity).toBe(p.radiators.length);
      expect(rows[0].codes).toEqual(
        p.radiators.map((_, index) => `RAD${index + 1}`),
      );
      expect(rows[0].locales.length).toBeGreaterThan(0);
    }
    expect(
      d.accessories
        .filter((row) => row.description.startsWith("Valvola "))
        .every((row) => row.details.includes("codice articolo")),
    ).toBe(true);
  });
  it("esprime la quantità dei radiatori in elementi con le dimensioni a colonna", () => {
    const p = dossierFixture(),
      d = buildDossier(p);
    const rows = d.materials.filter((row) =>
      row.codes.some((code) => code.startsWith("RAD")),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.pieces, 0)).toBe(
      p.radiators.length,
    );
    for (const row of rows) {
      const elements = p.radiators
        .filter((_, index) => row.codes.includes(`RAD${index + 1}`))
        .map((radiator) => radiator.elements);
      expect(new Set(elements).size).toBe(1);
      expect(row.unit).toBe("elementi");
      expect(row.pieceUnit).toBe("batterie");
      expect(row.pieces).toBe(elements.length);
      expect(row.quantity).toBe(elements[0] * row.pieces);
      expect(row.details).toContain(`Batteria da ${elements[0]} elementi`);
      expect(row.dimensions).toMatch(/^\d+ x \d+ x \d+ mm$/);
    }
  });
  it("genera PDF reale con cover, A3 vettoriale e schede oltre la distinta", async () => {
    const p = dossierFixture(),
      bytes = await renderDossierPdf(p),
      doc = await PDFDocument.load(bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF");
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(9);
    expect(doc.getPages().some((page) => page.getWidth() > 1100)).toBe(true);
    expect(doc.getTitle()).toContain(p.name);
  });
  it("non attribuisce fonti correnti a revisioni radiatore sconosciute", () => {
    const p = dossierFixture();
    p.radiators[0].catalogVersion = "revision-unknown";
    expect(buildDossier(p).unresolved.join(" ")).toContain("revision-unknown");
  });
  it("esclude dai totali attuali i contorni aperti senza perdere gli apparecchi", async () => {
    const p = dossierFixture();
    p.rooms[0].geometryStatus = "unresolved";
    const d = buildDossier(p);
    expect(d.provisionalRooms).toHaveLength(1);
    expect(d.totals.loadW).toBe(p.rooms[1].designLoadW);
    expect(d.materials.length).toBeGreaterThan(0);
    expect(
      (await PDFDocument.load(await renderDossierPdf(p))).getPageCount(),
    ).toBeGreaterThan(8);
  });
  it("esporta anche progetto vuoto senza inventare dati", async () => {
    const bytes = await renderDossierPdf(createProject());
    expect(
      (await PDFDocument.load(bytes)).getPageCount(),
    ).toBeGreaterThanOrEqual(6);
  });
  it("nomi estesi e liste materiali lunghe attraversano più pagine", async () => {
    const p = dossierFixture();
    p.rooms[0].name = "Ambiente principale molto lungo ".repeat(3);
    const base = p.radiators[0];
    p.radiators = Array.from({ length: 300 }, (_, i) => ({
      ...base,
      id: `rad-qa-${i}`,
    }));
    const bytes = await renderDossierPdf(p),
      doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(20);
  });
});
