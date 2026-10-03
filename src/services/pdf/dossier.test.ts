import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createProject } from "@/domain/project";
import { buildDossier, TECHNICAL_NOTE } from "./dossier";
import { renderDossierPdf } from "./render";
import { dossierFixture } from "./fixture";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";

describe("Dossier tecnico locale", () => {
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
    expect(d.materials.reduce((sum, m) => sum + m.quantity, 0)).toBe(
      p.radiators.length + p.airTerminals.length + p.hvacSystems.length,
    );
    expect(TECHNICAL_NOTE).toContain("Non sostituisce");
    expect(TECHNICAL_NOTE).toContain(
      "tecnico qualificato prima dell’esecuzione",
    );
    expect(d.materials.every((row) => row.locales.length > 0)).toBe(true);
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
