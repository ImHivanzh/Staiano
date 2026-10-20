import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

function plenumProject() {
  return projectSchema.parse(
    JSON.parse(
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
    import { placeSupplyPlenum } from './src/domain/ducted/placement.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    p = placeSupplyPlenum(p, p.hvacSystems[0].id);
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function importPlenumProject(page: Page) {
  const project = plenumProject();
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "plenum.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  return project;
}

async function exportProject(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

test("Ruota 90° su un plenum della macchina ruota macchina, plenum ed etichette insieme", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await importPlenumProject(page);
  await page.getByTestId("plenum-2d").locator("rect").click();
  await page
    .locator("aside.proprieta")
    .getByRole("button", { name: "Ruota 90°", exact: true })
    .click();
  const after = await exportProject(page);
  const machine = before.hvacSystems[0].indoorUnits[0];
  expect(after.hvacSystems[0].indoorUnits[0].rotation).toBeCloseTo(
    machine.rotation + Math.PI / 2,
  );
  expect(after.plenums[0].rotation).toBeCloseTo(
    before.plenums[0].rotation + Math.PI / 2,
  );
});

test("La macchina si ruota anche dalla sua scheda, fuori dal plenum", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await importPlenumProject(page);
  await page.getByTestId("split-2d").first().click();
  const dialog = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Ruota macchina 90°", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Annulla", exact: true })
    .first()
    .click();
  const after = await exportProject(page);
  const machine = before.hvacSystems[0].indoorUnits[0];
  expect(after.hvacSystems[0].indoorUnits[0].rotation).toBeCloseTo(
    machine.rotation + Math.PI / 2,
  );
  expect(after.plenums[0].rotation).toBeCloseTo(
    before.plenums[0].rotation + Math.PI / 2,
  );
});
