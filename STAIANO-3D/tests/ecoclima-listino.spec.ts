import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
  const setup = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
            import { guidedProjectFixture, addGuidedTerminal } from './tests/guided-fixture.ts';
            import { placeMachineOnPlan } from './src/domain/ducted/graphic-installation.ts';
            import { addTerminalPlenum } from './src/domain/ducted/attached-plenums.ts';
            import { commercialChoicesForTerminal } from './src/domain/air-terminals/commercial-bom.ts';
            let p = guidedProjectFixture();
            p.floors[0].configurationWizard = undefined;
            p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
            p = addGuidedTerminal(p, 1000);
            const choice = commercialChoicesForTerminal(p.airTerminals[0]).find(choice => choice.modelCode === p.airTerminals[0].commercialOptions?.profileCode && choice.colorCode === p.airTerminals[0].color);
            p.airTerminals[0].commercialOptions = { fixingBridges: true, continuityKit: true, profileCode: choice.modelCode, colorCode: choice.colorCode ?? undefined };
            p = addTerminalPlenum(p, p.airTerminals[0].id);
            console.log(JSON.stringify({ project: p, choice }));
          `,
      ],
      { encoding: "utf8" },
    ),
  );
  const fixture = projectSchema.parse(setup.project);
  const terminalId = fixture.airTerminals.find((t) => t.use === "supply")!.id;
  await page.getByTestId("project-file").setInputFiles({
    name: "listino.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.getByLabel("Plenum isolato Ecoclima")).toHaveCount(0);
  const waiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const file = await (await waiting).path();
  const project = projectSchema.parse(JSON.parse(readFileSync(file!, "utf8")));
  expect(project.plenums.find((p) => p.attachmentId === terminalId)).toEqual(
    fixture.plenums.find((p) => p.attachmentId === terminalId),
  );
  const catalog = JSON.parse(
    readFileSync("catalog-data/generated/ecoclima-prices.json", "utf8"),
  );
  const official = catalog.prices.find(
    (price: { id: string }) => price.id === setup.choice.id,
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
  await expect(dialog).toContainText(/ponte/i);
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
  expect(rows).toContain("STANZA:");
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
