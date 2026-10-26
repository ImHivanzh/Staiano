import { exportPlenumFixture } from "./plenum-ui-fixture";
import { test, expect } from "./browser-test";
import { PDFDocument, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";
import type { Project } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

test("PDF misto: una linea vettoriale non nasconde i muri nell’immagine", async ({
  page,
}) => {
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 450;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "white";
    c.fillRect(0, 0, 600, 450);
    c.strokeStyle = "black";
    c.lineWidth = 12;
    c.strokeRect(50, 50, 500, 350);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const pdf = await PDFDocument.create(),
    image = await pdf.embedPng(Buffer.from(png, "base64"));
  const sheet = pdf.addPage([600, 450]);
  sheet.drawImage(image, { x: 0, y: 0, width: 600, height: 450 });
  sheet.drawLine({
    start: { x: 10, y: 10 },
    end: { x: 100, y: 10 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "misto.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(
    dialog.getByLabel("Analisi automatica planimetria"),
  ).toContainText("4 proposte principali");
  await dialog
    .getByRole("button", { name: "Seleziona area da riconoscere" })
    .click();
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  const box = await preview.boundingBox();
  if (!box) throw new Error("Anteprima mancante");
  await preview.click({
    position: { x: box.width * 0.2, y: box.height * 0.15 },
  });
  await preview.click({
    position: { x: box.width * 0.8, y: box.height * 0.85 },
  });
  await dialog
    .getByRole("button", { name: "Riconosci muri nell’area" })
    .click();
  await expect(
    dialog.getByLabel("Analisi automatica planimetria"),
  ).toHaveAttribute("data-auto-count", "0");
  await dialog.getByRole("button", { name: "Analizza pagina intera" }).click();
  // La sintesi resta quella dell'analisi precedente finché la nuova non finisce.
  const analyzing = dialog.getByText(/Lettura e ricostruzione/);
  await expect(analyzing).toHaveCount(1);
  await expect(analyzing).toHaveCount(0);
  await expect(
    dialog.getByLabel("Analisi automatica planimetria"),
  ).toContainText("4 proposte principali");
  await dialog.getByRole("button", { name: "Seleziona punti scala" }).click();
  await preview.click({
    position: { x: box.width * 0.2, y: box.height * 0.5 },
  });
  await preview.click({
    position: { x: box.width * 0.7, y: box.height * 0.5 },
  });
  await dialog.getByLabel("Distanza reale di riferimento").fill("5");
  await dialog
    .getByRole("button", { name: "Calibra scala", exact: true })
    .click();
  const importWalls = dialog.getByRole("button", {
    name: /^Importa muri selezionati/,
    exact: true,
  });
  await expect(importWalls).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Seleziona proposte visibili" })
    .click();
  await dialog
    .getByLabel(/Le geometrie selezionate rappresentano assi muro/)
    .check();
  await expect(importWalls).toBeEnabled();
  await importWalls.click();
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(4);
  const imported = await exportPlenumFixture(page);
  expect(imported.rooms).toHaveLength(1);
  expect(imported.rooms[0].geometryStatus).toBe("closed");
  expect(imported.floors[0].importAnalysis).toMatchObject({
    algorithmVersion: "local-lines-9",
    sourceType: "pdf",
    wallsAutoCreated: 0,
    wallsConfirmedByOperator: 4,
  });
  expect(imported.sourceFilesMetadata[0].originalDataUrl).toMatch(
    /^data:application\/pdf;base64,/,
  );
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 800, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`editor importato: pannelli confinati a ${viewport.width}×${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    const project = JSON.parse(
      readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
    ) as Project;
    project.name = "Planimetria importata";
    project.floors[0].configurationWizard = {
      status: "active",
      step: 2,
      confirmedSteps: [0, 1],
    };
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "importato.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(
      page.getByRole("region", { name: "Configurazione guidata" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dossier PDF", exact: true }),
    ).toBeHidden();
    await openDisclosure(page, "File");
    await expect(
      page.getByRole("button", { name: "Dossier PDF", exact: true }),
    ).toBeVisible();
    const fileMenu = page
      .locator(".azioni-testata details[open]")
      .filter({ has: page.locator("summary").filter({ hasText: "File" }) });
    if (viewport.width <= 640) {
      for (const width of [viewport.width, 320, viewport.width]) {
        await page.setViewportSize({ width, height: viewport.height });
        await expect
          .poll(async () => {
            const trigger = (await fileMenu.locator("summary").boundingBox())!;
            const panel = (await fileMenu
              .locator(".comandi-progetto")
              .boundingBox())!;
            return (
              panel.y >= trigger.y + trigger.height &&
              panel.y + panel.height <= viewport.height
            );
          })
          .toBe(true);
      }
    }
    await fileMenu.locator("summary").click();
    const size = await page.evaluate(() => ({
      height: innerHeight,
      width: innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(size.scrollHeight).toBeLessThanOrEqual(size.height + 1);
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width + 1);
    await page.locator(".area-editor").scrollIntoViewIfNeeded();
    const editor = await page.locator(".area-editor").boundingBox();
    if (!editor) throw new Error("Editor mancante");
    expect(editor.height).toBeGreaterThanOrEqual(
      viewport.width > 900 ? 400 : 175,
    );
    expect(editor.y + editor.height).toBeLessThanOrEqual(viewport.height + 1);
    if (viewport.width <= 640) {
      const scrollport = (await page.locator(".configuratore").boundingBox())!;
      expect(editor.y).toBeGreaterThanOrEqual(scrollport.y - 1);
      expect(editor.y + editor.height).toBeLessThanOrEqual(
        scrollport.y + scrollport.height + 1,
      );
    }
    await page.locator(".pannello-progetto").hover();
    await page.mouse.wheel(0, 2000);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({
      path: info.outputPath("editor.png"),
      fullPage: true,
    });
  });
}
