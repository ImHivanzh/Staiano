import { describe, expect, it } from "vitest";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import { pdfQaFixture } from "../../../scripts/verification/pdf-fixture";
import { renderDossierPdf } from "./render";
import { buildDossier } from "./dossier";
import { plenumTechnicalDrawing } from "@/domain/ducted/technical-view";
import { placedPlenumGeometry } from "@/domain/ducted/placement";
import {
  fanCoilProductAtVersion,
  fanCoilControlAtVersion,
} from "@/domain/catalogs/fan-coils";

describe("Readable complete PDF contract", () => {
  it.each(["summary", "complete"] as const)(
    "includes prices in the %s dossier only when selected",
    async (variant) => {
      const project = pdfQaFixture();
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const texts: string[] = [];
      for (const includePrices of [false, true]) {
        const task = pdfjs.getDocument({
          data: await renderDossierPdf(project, { variant, includePrices }),
        });
        const pdf = await task.promise;
        try {
          const pages: string[] = [];
          for (let page = 1; page <= pdf.numPages; page++) {
            const content = await (await pdf.getPage(page)).getTextContent();
            pages.push(
              content.items
                .map((item) => ("str" in item ? item.str : ""))
                .join(" "),
            );
          }
          texts.push(pages.join(" "));
        } finally {
          await task.destroy();
        }
      }
      expect(texts[0]).not.toContain("Listino materiali Ecoclima");
      expect(texts[0]).not.toContain(" EUR");
      expect(texts[1]).toContain("Listino materiali Ecoclima");
      expect(texts[1]).toContain(" EUR");
    },
  );
  it.each(["complete", "summary"] as const)(
    "prints the %s dossier using only gray vector colours and readable text",
    async (variant) => {
      const document = await PDFDocument.load(
        await renderDossierPdf(pdfQaFixture(), { variant, monochrome: true }),
      );
      expect(document.getTitle()).toContain("bianco e nero");
      let colours = 0;
      for (const page of document.getPages()) {
        const contents = page.node.Contents();
        const refs =
          contents instanceof PDFArray ? contents.asArray() : [contents];
        for (const ref of refs) {
          const stream = document.context.lookup(ref);
          expect(stream).toBeInstanceOf(PDFRawStream);
          const text = new TextDecoder().decode(
            decodePDFRawStream(stream as PDFRawStream).decode(),
          );
          for (const match of text.matchAll(
            /([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)\b/g,
          )) {
            expect(Number(match[1])).toBe(Number(match[2]));
            expect(Number(match[2])).toBe(Number(match[3]));
            colours++;
          }
          expect(text).toMatch(/\bTj\b/);
        }
      }
      expect(colours).toBeGreaterThan(100);
    },
  );
  it("keeps all real port numbers in both projections for each independent machine", () => {
    const project = pdfQaFixture();
    expect(project.plenums).toHaveLength(2);
    for (const system of project.hvacSystems) {
      const placed = project.plenums.find(
        (plenum) => plenum.systemId === system.id,
      )!;
      const geometry = placedPlenumGeometry(project, placed)!;
      expect(geometry.ports.length).toBeGreaterThan(0);
      for (const view of ["isometric", "top", "front"] as const) {
        const drawing = plenumTechnicalDrawing(project, system.id, view)!;
        expect(drawing.portCount).toBe(geometry.ports.length);
        expect(
          drawing.labels
            .filter((label) => /^\d+$/.test(label.text))
            .map((label) => Number(label.text)),
        ).toEqual(geometry.ports.map((port) => port.number));
        const portLabels = drawing.labels.filter((label) =>
          /^\d+$/.test(label.text),
        );
        expect(
          new Set(portLabels.map((label) => JSON.stringify(label.point))).size,
        ).toBe(geometry.ports.length);
        expect(
          drawing.polygons.every((polygon) =>
            polygon.points.every((point) => point.every(Number.isFinite)),
          ),
        ).toBe(true);
      }
    }
  });
  it("extracts exact machine, vent and duct codes plus original M7 metadata from the generated PDF", async () => {
    const project = pdfQaFixture();
    const data = buildDossier(project);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: await renderDossierPdf(project) });
    const document = await task.promise;
    try {
      const pages: string[] = [];
      for (let index = 1; index <= document.numPages; index++) {
        const content = await (await document.getPage(index)).getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
      }
      const text = pages.join(" ");
      expect(text).toContain("6350 W caldo / 3810 W freddo");
      expect(text).toContain("potenze massime dichiarate");
      for (const item of [
        ...project.plenums,
        ...project.airTerminals,
        ...(project.ducts ?? []),
        ...(project.fanCoils ?? []),
      ])
        expect(text).toContain(data.codes.get(item.id));
      expect(text).not.toContain("quote muro all'asse");
      expect(text).toContain("quote interne utili");
      expect(text).toContain("luce interna non pubblicata: da verificare");
      expect(text).toContain("Vista 3D isometrica del plenum");
      expect(text).toContain("Vista tecnica dall'alto");
      expect(text).toContain("M7");
      const unit = project.fanCoils![0];
      const product = fanCoilProductAtVersion(
        unit.productId,
        unit.catalogVersion,
      )!;
      const control = fanCoilControlAtVersion(
        unit.controllerId!,
        unit.catalogVersion,
      )!;
      expect(text).toContain(product.model);
      expect(text).toContain(control.model);
      expect(text).toContain(unit.controllerBoard);
      const pump = project.hydronicSystems![0];
      expect(text).toContain(data.codes.get(pump.id));
      expect(text).toContain(data.codes.get(pump.outdoorUnit.id));
      expect(text).toContain("Pompe di calore e collegamenti idronici");
      expect(text).toContain("Circuito saletta");
      expect(
        data.sources.some(
          (source) => source.sha256 === control.sourceMetadata.sha256,
        ),
      ).toBe(true);
    } finally {
      await task.destroy();
    }
  });
  it("does not borrow current fan coil metadata for an unknown historical revision", () => {
    const project = pdfQaFixture();
    project.fanCoils![0].catalogVersion = "missing-historical-fan-coils";
    const data = buildDossier(project);
    expect(
      data.unresolved.some((message) =>
        message.includes("missing-historical-fan-coils"),
      ),
    ).toBe(true);
    expect(
      data.materials.find(
        (row) =>
          row.codes.includes(data.codes.get(project.fanCoils![0].id)!) &&
          row.description === project.fanCoils![0].productId,
      )?.details,
    ).toContain("non verificabile");
  });
  it("creates a client summary with real balances and equipment without coordinate floor plans, keeping warnings in the complete report", async () => {
    const project = pdfQaFixture();
    project.ducts = [];
    project.airTerminals[0].plenumId = null;
    const data = buildDossier(project);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const completeTask = pdfjs.getDocument({
      data: await renderDossierPdf(project),
    });
    const summaryTask = pdfjs.getDocument({
      data: await renderDossierPdf(project, {
        variant: "summary",
        renderImages: [
          {
            title: "Render di verifica",
            floorId: project.floors[0].id,
            mimeType: "image/jpeg",
            width: 1024,
            height: 1024,
            bytes: new Uint8Array(
              await readFile("public/materials3d/stone/basecolor.jpg"),
            ),
          },
        ],
      }),
    });
    const [complete, summary] = await Promise.all([
      completeTask.promise,
      summaryTask.promise,
    ]);
    try {
      expect(summary.numPages).toBeLessThan(complete.numPages);
      const texts: string[] = [];
      let floorPlans = 0;
      for (let page = 1; page <= summary.numPages; page++) {
        const sheet = await summary.getPage(page);
        const content = await sheet.getTextContent();
        if (sheet.view[2] > 1100) floorPlans++;
        texts.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
      }
      const text = texts.join(" ");
      expect(text).toContain("Dossier sintetico");
      expect(text).toContain(
        "Potenze massime dichiarate: 6350 W caldo / 3810 W freddo",
      );
      expect(text).toContain("Metri richiesti / installati e capacita reale");
      expect(text).toContain("Vista frontale - tutti gli attacchi");
      expect(text).toContain("4 attacchi richiesti / 4 disegnabili");
      expect(text).toContain("M7");
      expect(text).toContain("Chaffoteaux");
      expect(text).toContain("X -2, Y -1, quota 0,15 m");
      expect(floorPlans).toBe(0);
      for (const floor of project.floors)
        expect(text).not.toContain(`Planimetria - ${floor.name}`);
      for (const warning of [
        "terminalConnection",
        "Altri avvisi raggruppati",
        "Anomalie",
        "Controlli",
        "AVVISO",
        "NON VALIDABILE",
        "da verificare",
        "Visualizzazione orientativa",
      ])
        expect(text).not.toContain(warning);
      expect(text).toContain(
        "Render degli ambienti e degli impianti del progetto",
      );
      for (const check of data.checks.filter(
        (item) => item.status === "invalid",
      ))
        expect(text).not.toContain(check.code);
      const fullText: string[] = [];
      for (let page = 1; page <= complete.numPages; page++) {
        const content = await (await complete.getPage(page)).getTextContent();
        fullText.push(
          content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" "),
        );
      }
      expect(fullText.join(" ")).toContain("terminalConnection");
      expect(fullText.join(" ")).toContain("AVVISO");
      for (const floor of project.floors)
        expect(fullText.join(" ")).toContain(`Planimetria - ${floor.name}`);
      for (const balance of data.linearBalances) {
        expect(text).toContain(
          `${balance.airflowM3h.toLocaleString("it-IT", { maximumFractionDigits: 2 })} / ${balance.availableAirflowM3h.toLocaleString("it-IT", { maximumFractionDigits: 2 })} m³/h`,
        );
      }
    } finally {
      await completeTask.destroy();
      await summaryTask.destroy();
    }
  });
  it("non riporta dati degli impianti assenti e include gli accessori dei radiatori", async () => {
    const project = pdfQaFixture();
    project.hvacSystems = [];
    project.airTerminals = [];
    project.plenums = [];
    project.ducts = [];
    project.fanCoils = [];
    project.hydronicSystems = [];
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const read = async (bytes: Uint8Array) => {
      const task = pdfjs.getDocument({ data: bytes });
      const document = await task.promise;
      try {
        const pages: string[] = [];
        for (let page = 1; page <= document.numPages; page++) {
          const content = await (await document.getPage(page)).getTextContent();
          pages.push(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
        }
        return { text: pages.join(" "), pages: document.numPages };
      } finally {
        await task.destroy();
      }
    };
    const summary = await read(
      await renderDossierPdf(project, { variant: "summary" }),
    );
    for (const noun of [
      "Staffe di sostegno",
      "Valvola",
      "Detentore",
      "Kit copritubo",
    ])
      expect(summary.text).toContain(noun);
    expect(summary.text).toContain("Distinta materiali");
    expect(summary.text).toContain("Descrizione / codici");
    expect(summary.text).toContain("Dimensioni");
    expect(summary.text).toMatch(/\d+ elementi/);
    for (const absent of [
      "Bilanci e plenum dedicati",
      "Nessun bilancio lineare disponibile",
      "Metri richiesti / installati e capacita reale",
      "Con modelli misti",
      "Vista frontale - tutti gli attacchi",
      "Pompe di calore e collegamenti idronici",
      "Diametri stacchi nominali",
    ])
      expect(summary.text).not.toContain(absent);
    const complete = await read(await renderDossierPdf(project));
    expect(complete.text).toContain("Distinta materiali - senza prezzi");
    expect(complete.text).not.toContain("Sistemi HVAC");
    expect(complete.text).not.toContain(
      "Nessun sistema split o canalizzato configurato",
    );
  });
});
