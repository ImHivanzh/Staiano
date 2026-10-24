import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "./browser-test";
import {
  chooseFanCoilModel,
  openDisclosure,
  openInspector,
  pickPlanPoint,
} from "./ui-helpers";

async function snapshot(page: Page) {
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, "utf8"));
}
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
}
async function settings(page: Page) {
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Impostazioni progetto e piani" })
    .click();
}

test("units, project defaults and floor management preserve existing geometry through save and reopen", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await start(page);
  const creation = page.getByRole("dialog");
  await creation
    .getByRole("group", { name: "Misura Larghezza netta", exact: true })
    .getByRole("combobox")
    .selectOption("mm");
  await creation
    .getByRole("spinbutton", { name: "Larghezza netta (mm)", exact: true })
    .fill("5000");
  await creation
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const before = await snapshot(page);
  expect(before.rooms[0].netAreaM2).toBeCloseTo(19, 5);
  await settings(page);
  await page
    .getByRole("spinbutton", { name: "Altezza predefinita (m)" })
    .fill("3.2");
  await page
    .getByRole("group", { name: "Misura Spessore muri esterni", exact: true })
    .getByRole("combobox")
    .selectOption("mm");
  await page
    .getByRole("spinbutton", { name: "Spessore muri esterni (mm)" })
    .fill("250");
  await page.getByRole("button", { name: "Applica impostazioni" }).click();
  await page.getByLabel("Nome piano 1", { exact: true }).fill("Ingresso");
  await page
    .locator(".gestione-piano")
    .getByRole("button", { name: "Rinomina piano" })
    .click();
  page.once("dialog", (dialog) => dialog.accept("Zona notte"));
  await page
    .getByRole("button", { name: "Aggiungi piano", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sposta prima Zona notte", exact: true })
    .click();
  let saved = await snapshot(page);
  expect(saved.floors.map((floor: { name: string }) => floor.name)).toEqual([
    "Zona notte",
    "Ingresso",
  ]);
  expect(saved.rooms[0].floorId).toBe(before.rooms[0].floorId);
  expect(saved.rooms[0].heightM).toBe(3);
  expect(
    saved.walls.every((wall: { thickness: number }) => wall.thickness === 0.5),
  ).toBe(true);
  await page.getByRole("button", { name: "Planimetria", exact: true }).click();
  await openDisclosure(page, "Disegno e misure");
  await page
    .getByRole("button", { name: "Stanza rettangolare", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("spinbutton", { name: "Altezza (m)", exact: true }),
  ).toHaveValue("3.2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  saved = await snapshot(page);
  const upstairs = saved.rooms.find(
    (room: { floorId: string }) => room.floorId === saved.floors[0].id,
  );
  expect(upstairs.heightM).toBe(3.2);
  expect(
    saved.walls
      .filter(
        (wall: { floorId: string }) => wall.floorId === saved.floors[0].id,
      )
      .every((wall: { thickness: number }) => wall.thickness === 0.25),
  ).toBe(true);
  await page.reload();
  await settings(page);
  await expect(page.getByLabel("Nome piano 1", { exact: true })).toHaveValue(
    "Zona notte",
  );
  await expect(
    page.getByRole("spinbutton", {
      name: "Altezza predefinita (m)",
      exact: true,
    }),
  ).toHaveValue("3.2");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("settings-mobile.png"),
    fullPage: true,
  });
});

test("unconditioned room remains explicit after reopening and PDF preview downloads the displayed document", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await start(page);
  await page
    .getByRole("dialog")
    .getByRole("spinbutton", { name: "Altezza (m)", exact: true })
    .fill("2.7");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Modifica stanza");
  await page
    .getByRole("checkbox", { name: "Ambiente non climatizzato" })
    .check();
  await page
    .getByLabel("Motivo esclusione", { exact: true })
    .fill("Ripostiglio senza riscaldamento");
  await page
    .getByRole("button", { name: "Applica climatizzazione ambiente" })
    .click();
  await expect(page.getByTestId("room-load")).toContainText("0,00");
  await expect(page.getByTestId("project-progress")).toContainText(
    "Pronto per dossier preliminare",
  );
  const project = await snapshot(page);
  expect(project.rooms[0].conditioningExclusion.reason).toBe(
    "Ripostiglio senza riscaldamento",
  );
  expect(project.rooms[0].volumeM3).toBeCloseTo(15.96 * 2.7, 5);
  await page.reload();
  await page.getByRole("button", { name: /^Soggiorno/ }).click();
  await expect(page.locator(".impianto-attuale")).toContainText(
    "Escluso dalla climatizzazione",
  );
  await openDisclosure(page, "File");
  let pdfDownloads = 0;
  page.on("download", (download) => {
    if (download.suggestedFilename().endsWith(".pdf")) pdfDownloads++;
  });
  await page
    .getByRole("button", { name: "Anteprima PDF", exact: true })
    .click();
  const preview = page.getByRole("dialog", { name: "Anteprima dossier PDF" });
  await expect(preview.getByTestId("pdf-preview-page")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(preview.getByRole("status")).toContainText("Pagina 1 di");
  await preview.getByRole("button", { name: "Pagina successiva" }).click();
  await expect(preview.getByTestId("pdf-preview-page")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(preview.getByRole("status")).toContainText("Pagina 2 di");
  expect(pdfDownloads).toBe(0);
  await preview.screenshot({ path: info.outputPath("pdf-preview.png") });
  const download = page.waitForEvent("download");
  await preview.getByRole("button", { name: "Scarica questo PDF" }).click();
  const file = await (await download).path();
  expect(
    (await PDFDocument.load(readFileSync(file!))).getPageCount(),
  ).toBeGreaterThan(2);
  expect(pdfDownloads).toBe(1);
  await preview.getByRole("button", { name: "Chiudi anteprima PDF" }).click();
  await expect(preview).toHaveCount(0);
  await openInspector(page, "Modifica stanza");
  await page
    .getByRole("checkbox", { name: "Ambiente non climatizzato" })
    .uncheck();
  await page
    .getByRole("button", { name: "Applica climatizzazione ambiente" })
    .click();
  await expect(page.getByTestId("room-load")).toContainText("1,51");
});

test("fan coils use the correct room label", async ({ page }) => {
  await start(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  await chooseFanCoilModel(
    page.getByRole("dialog", { name: "Configura apparecchio", exact: true }),
    { manufacturer: "Aermec", model: "FCZ" },
  );
  await page
    .getByRole("dialog", { name: "Configura apparecchio", exact: true })
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 3.8, 0.4);
  await plan.getByTestId("draft-fanCoil").last().click();
  await chooseFanCoilModel(
    page.getByRole("dialog", { name: "Configura apparecchio", exact: true }),
    { manufacturer: "Aermec", model: "FCZ" },
  );
  await page
    .getByRole("dialog", { name: "Configura apparecchio", exact: true })
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await page.getByRole("button", { name: /^Soggiorno/ }).click();
  await expect(page.locator(".impianto-attuale")).toHaveText(
    /2 ventilconvettori nella stanza/,
  );
  const saved = await snapshot(page);
  expect(saved.fanCoils).toHaveLength(2);
  expect(
    new Set(saved.fanCoils.map((unit: { roomId: string }) => unit.roomId)),
  ).toEqual(new Set([saved.rooms[0].id]));
});

test("recalibration previews changes, cancellation preserves data and confirmation retains physical dimensions", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  const project = JSON.parse(
    readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
  );
  project.floors[0].background = {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=",
    widthPx: 1000,
    heightPx: 1000,
    metersPerPixel: 0.01,
    origin: { x: 0, y: 0 },
    opacity: 0.5,
    filename: "reference.png",
  };
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "calibration.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const before = await snapshot(page);
  async function calibrate() {
    await openDisclosure(page, "Modifica");
    await page.getByRole("button", { name: "Ricalibra", exact: true }).click();
    const box = (await page.getByTestId("editor-2d").boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.25);
    return page.getByRole("dialog", { name: "Anteprima ricalibrazione" });
  }
  let preview = await calibrate();
  let input = preview.getByRole("spinbutton", {
    name: "Distanza reale tra i punti (m)",
    exact: true,
  });
  await input.fill(String(Number(await input.inputValue()) * 2));
  await expect(preview).toContainText("Superficie netta del piano");
  await preview.screenshot({
    path: info.outputPath("calibration-preview.png"),
  });
  await preview.getByRole("button", { name: "Annulla ricalibrazione" }).click();
  const unchanged = await snapshot(page);
  expect(unchanged.walls).toEqual(before.walls);
  expect(unchanged.floors[0].background.metersPerPixel).toBe(
    before.floors[0].background.metersPerPixel,
  );
  preview = await calibrate();
  input = preview.getByRole("spinbutton", {
    name: "Distanza reale tra i punti (m)",
    exact: true,
  });
  await input.fill(String(Number(await input.inputValue()) * 2));
  await preview
    .getByRole("button", { name: "Conferma ricalibrazione" })
    .click();
  await expect(preview).toHaveCount(0);
  const after = await snapshot(page);
  expect(after.floors[0].background.metersPerPixel).toBeCloseTo(
    before.floors[0].background.metersPerPixel * 2,
    8,
  );
  expect(
    after.radiators.map((unit: { widthMm: number }) => unit.widthMm),
  ).toEqual(before.radiators.map((unit: { widthMm: number }) => unit.widthMm));
  expect(after.rooms[0].netAreaM2).toBeGreaterThan(
    before.rooms[0].netAreaM2 * 2,
  );
});
