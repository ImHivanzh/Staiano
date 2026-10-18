import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";
import { unzipSync, strFromU8 } from "three/addons/libs/fflate.module.js";

test("official Ecoclima model and insulated plenum create an itemized list-price bill", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles("tests/fixtures/realistic-home.hvacproj");
  await page.getByTestId("terminal-supply").first().click();
  await openDisclosure(
    page.locator(".proprieta"),
    "Modello, finitura e accessori",
  );
  const article = page.getByLabel("Articolo Ecoclima di listino");
  const choices = await article
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value).filter(Boolean),
    );
  expect(choices.length).toBeGreaterThan(0);
  await article.selectOption(choices[0]);
  const plenum = page.getByLabel("Plenum isolato Ecoclima");
  const boxes = await plenum
    .locator("option")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLOptionElement).value).filter(Boolean),
    );
  expect(boxes.length).toBeGreaterThan(0);
  await plenum.selectOption(boxes[0]);
  const waiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const file = await (await waiting).path();
  const project = projectSchema.parse(JSON.parse(readFileSync(file!, "utf8")));
  const catalog = JSON.parse(
    readFileSync("catalog-data/generated/ecoclima-prices.json", "utf8"),
  );
  const official = catalog.prices.find(
    (price: { id: string }) => price.id === choices[0],
  );
  expect(official.unitPriceCents).toBeGreaterThan(0);
  expect(
    project.airTerminals.some(
      (terminal) =>
        terminal.commercialOptions?.profileCode === official.modelCode,
    ),
  ).toBe(true);
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Listino materiali", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Listino materiali Ecoclima",
  });
  await expect(
    dialog.getByText("Articoli con prezzo:", { exact: false }),
  ).toBeVisible();
  await expect(dialog).toContainText("EPI");
  await expect(dialog).toContainText(
    (official.unitPriceCents / 100).toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
    }),
  );
  await expect(dialog).toContainText("Ponte");
  const csvDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Esporta distinta CSV" }).click();
  const csvFile = await (await csvDownload).path();
  const csv = readFileSync(csvFile!, "utf8");
  expect(csv.startsWith('\uFEFF"Codice";"Articolo";"Quantità"')).toBe(true);
  expect(csv).toContain(official.modelCode);
  expect(csv).toContain(
    (official.unitPriceCents / 100).toFixed(2).replace(".", ","),
  );
  expect(csv).toContain("Da completare");
  const excelDownload = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Esporta Excel per Easyfatt" })
    .click();
  const excel = await excelDownload;
  expect(excel.suggestedFilename()).toMatch(/-preventivo-easyfatt\.xlsx$/);
  const workbook = unzipSync(readFileSync((await excel.path())!));
  const rows = strFromU8(workbook["xl/worksheets/sheet1.xml"]);
  expect(rows).toContain(official.modelCode);
  expect(rows).toContain(`<v>${official.unitPriceCents / 100}</v>`);
  expect(strFromU8(workbook["xl/workbook.xml"])).toContain("Da completare");
  await dialog
    .getByText("Come importare il preventivo in Easyfatt", { exact: true })
    .click();
  await expect(dialog).toContainText("Prepara modello vuoto di importazione");
  await dialog.screenshot({
    path: testInfo.outputPath("itemized-ecoclima-list-prices.png"),
  });
  await dialog.getByRole("button", { name: "Chiudi listino" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
});
