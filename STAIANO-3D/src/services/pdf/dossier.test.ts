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
import { validateProject } from "@/domain/validation";
import { applyFanCoil } from "@/domain/fan-coils/apply";
import { fanCoilCatalog } from "@/domain/catalogs/fan-coils";
import {
  radiatorProducts,
  radiatorCatalogs,
} from "@/domain/catalogs/radiators";

describe("Dossier tecnico locale", () => {
  it("lists generic accessory colours without calling them matching body or official finishes", () => {
    const project = dossierFixture();
    project.radiators[0].finishes = {
      bodyColorId: "cordivari-r01",
      valveColorId: "generic-white",
      lockshieldColorId: "generic-chrome",
    };
    const rows = buildDossier(project).accessories;
    for (const label of ["Bianco (generico)", "Cromo (generico)"]) {
      const row = rows.find((row) => row.details.includes(label));
      expect(row?.details).toContain("finitura generica");
      expect(row?.details).not.toContain("in tinta corpo");
    }
  });
  it("lists matching valve and lockshield finishes and flags undocumented accessory colours", () => {
    const project = dossierFixture();
    const product = radiatorProducts.find(
      (p) => p.family === "Empoli antracite",
    )!;
    project.radiators = [
      {
        ...project.radiators[0],
        productId: product.id,
        manufacturer: product.manufacturer,
        family: product.family,
        catalogVersion: radiatorCatalogs.find((c) =>
          c.products.some((p) => p.id === product.id),
        )!.version,
        finishes: undefined,
      },
    ];
    const rows = buildDossier(project).accessories.filter((row) =>
      /^(Valvola|Detentore) /.test(row.description),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.details).toContain(
        "in tinta corpo, disponibilità della finitura accessorio da verificare",
      );
      expect(row.details).toContain("VOV12");
    }
  });
  it("riporta kit SLI RASOMURO e scheda richiesta dal comando separato", () => {
    const base = dossierFixture();
    const room = base.rooms.find((item) => item.name === "Soggiorno")!;
    const sli = fanCoilCatalog.products.find(
      (item) => item.family === "AirLeaf SLI" && item.model === "SLI 200",
    )!;
    const project = applyFanCoil(base, room.id, sli.id, 0, {
      mounting: "wall",
      panelType: "rasomuro",
      controllerId: "innova-eeb749ii",
    });
    const dossier = buildDossier(project);
    const accessories = dossier.accessories;
    expect(
      dossier.materials.find((item) => item.description.includes("SLI 200"))
        ?.details,
    ).toContain("geometria 3D orientativa: corpo e griglie schematici");
    expect(accessories.map((item) => item.description)).toContain(
      "Cassaforma RASOMURO Innova AirLeaf SLI",
    );
    expect(accessories.map((item) => item.description)).toContain(
      "Pannello estetico RASOMURO Innova AirLeaf SLI verticale",
    );
    expect(
      accessories.find((item) => item.description.includes("ESE745II"))
        ?.quantity,
    ).toBe(1);
  });
  it("riporta i kit RASOMURO RSI e tradizionale SLSI con le relative taglie", () => {
    const base = dossierFixture();
    const room = base.rooms.find((item) => item.name === "Soggiorno")!;
    const rsi = fanCoilCatalog.products.find(
      (item) => item.id === "innova-airleaf-rsi-400-2t",
    )!;
    const rsiAccessories = buildDossier(
      applyFanCoil(base, room.id, rsi.id, 0, {
        mounting: "wall",
        panelType: "rasomuro",
        controllerId: "innova-eeb749ii",
      }),
    ).accessories;
    expect(rsiAccessories.map((item) => item.details)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("L01041II"),
        expect.stringContaining("LC1082II"),
        expect.stringContaining("ESE745II"),
      ]),
    );
    const slsi = fanCoilCatalog.products.find(
      (item) => item.id === "innova-airleaf-slsi-400-2t",
    )!;
    const slsiAccessories = buildDossier(
      applyFanCoil(base, room.id, slsi.id, 0, {
        mounting: "wall",
        panelType: "traditional",
      }),
    ).accessories;
    expect(slsiAccessories.map((item) => item.details)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("L00701II"),
        expect.stringContaining("LC0693II"),
      ]),
    );
  });
  it("riporta in distinta cassaforma, pannello o kit a griglie del Bi2 Naked", () => {
    const base = dossierFixture();
    const room = base.rooms.find((item) => item.name === "Soggiorno")!;
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "olimpia-01513",
    )!;
    const traditional = buildDossier(
      applyFanCoil(base, room.id, product.id, 0, {
        mounting: "wall",
        panelType: "traditional",
      }),
    ).accessories;
    expect(traditional.map((item) => item.description)).toContain(
      "Cassaforma Olimpia Splendid Bi2 Naked",
    );
    expect(
      traditional.find((item) => item.description.startsWith("Cassaforma"))
        ?.details,
    ).toContain("B0568");
    expect(
      traditional.find((item) =>
        item.description.includes("Pannello metallico di chiusura"),
      ),
    ).toMatchObject({ quantity: 1, details: expect.stringContaining("B0955") });
    const grilles = buildDossier(
      applyFanCoil(base, room.id, product.id, 0, {
        mounting: "wall",
        panelType: "grilles-90",
      }),
    ).accessories;
    expect(grilles.map((item) => item.description)).toContain(
      "Plenum di mandata 90° coibentato Olimpia Splendid Bi2 Naked",
    );
    expect(
      grilles.find((item) => item.description.startsWith("Kit di aspirazione"))
        ?.details,
    ).toContain("B0194");
    expect(
      grilles.find((item) => item.description.startsWith("Griglia di mandata"))
        ?.details,
    ).toContain("B0550");
    expect(grilles.map((item) => item.description)).toContain(
      "Pannello di copertura da realizzare in cantiere",
    );
  });
  it("riporta i mobili Aermec MZA/MZU scelti per FCZ P", () => {
    const base = dossierFixture();
    const room = base.rooms.find((item) => item.name === "Soggiorno")!;
    const product = fanCoilCatalog.products.find(
      (item) => item.id === "aermec-fcz400p",
    )!;
    const project = applyFanCoil(base, room.id, product.id, 0, {
      mounting: "wall",
      coverType: "adjustable",
    });
    expect(buildDossier(project).accessories).toContainEqual(
      expect.objectContaining({
        description: "Mobile di copertura Aermec FCZ P · alette orientabili",
        quantity: 1,
        details: expect.stringContaining("MZU500"),
      }),
    );
  });

  it("esclude i problemi di porte e finestre solo dal dossier", async () => {
    const project = dossierFixture();
    const terminal = project.airTerminals[0];
    const wall = project.walls.find(
      (item) => item.id === project.rooms[0].wallIds[0],
    )!;
    terminal.mounting = "wall";
    terminal.wallId = wall.id;
    terminal.position = wall.start;
    terminal.rotation = Math.atan2(
      wall.end.y - wall.start.y,
      wall.end.x - wall.start.x,
    );
    terminal.elevationM = 1;
    project.openings = ["door", "window"].map((type) => ({
      id: `test-${type}`,
      type: type as "door" | "window",
      wallId: wall.id,
      floorId: wall.floorId,
      offsetM: 0,
      widthM: 100,
      heightM: 2,
      sillHeightM: 0,
    }));
    const editorChecks = validateProject(project);
    expect(
      editorChecks.some(
        (check) => check.entityId === "test-door" && check.status === "invalid",
      ),
    ).toBe(true);
    expect(
      editorChecks.some(
        (check) =>
          check.openingId === "test-door" && check.code === "terminalOpening",
      ),
    ).toBe(true);
    const dossier = buildDossier(project);
    expect(dossier.checks).toEqual(
      editorChecks.filter(
        (check) =>
          !project.openings.some(
            (opening) =>
              opening.id === check.entityId || opening.id === check.openingId,
          ),
      ),
    );
    expect(
      editorChecks.some(
        (check) =>
          check.entityId === "test-window" && check.status === "invalid",
      ),
    ).toBe(true);
    expect(
      editorChecks.some(
        (check) =>
          check.openingId === "test-window" && check.code === "terminalOpening",
      ),
    ).toBe(true);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const variant of ["complete", "summary"] as const) {
      const task = pdfjs.getDocument({
        data: await renderDossierPdf(project, { variant }),
      });
      const document = await task.promise;
      try {
        const texts: string[] = [];
        for (let page = 1; page <= document.numPages; page++) {
          const content = await (await document.getPage(page)).getTextContent();
          texts.push(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
        }
        const text = texts.join(" ");
        expect(text).not.toContain("Porta: apertura fuori");
        expect(text).not.toContain("sovrapposizione con porta");
        expect(text).not.toContain("Finestra: apertura fuori");
        expect(text).not.toContain("sovrapposizione con finestra");
      } finally {
        await task.destroy();
      }
    }
  });
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
