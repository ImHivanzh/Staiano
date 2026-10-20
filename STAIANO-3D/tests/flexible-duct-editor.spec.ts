import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

function flexibleProject() {
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
    import { generateDuctRoutes, setDuctKind } from './src/domain/ducted/routes.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    p = placeSupplyPlenum(p, p.hvacSystems[0].id);
    p = generateDuctRoutes(p, p.hvacSystems[0].id);
    const duct = p.ducts.find((d) => d.terminalId);
    p = setDuctKind(p, duct.id, 'flexible');
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function importProject(page: Page) {
  const project = flexibleProject();
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "flessibili.hvacproj",
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

async function exported(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

test("Flessibili: pulsante in 2D, curve in pannello e modifica diretta in 3D", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await importProject(page);
  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  const panel = page.getByRole("dialog", {
    name: "Configura flessibili",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const flexibleRow = panel.locator("article").last();
  await expect(flexibleRow.getByRole("combobox")).toHaveValue("flexible");
  await flexibleRow
    .getByRole("button", { name: "Aggiungi curva", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Chiudi flessibili", exact: true })
    .click();
  const afterPanel = await exported(page);
  const flexible = afterPanel.ducts!.find((duct) => duct.terminalId)!;
  expect(flexible.kind).toBe("flexible");
  expect(flexible.routing).toBe("manual");
  expect(flexible.waypoints.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Flessibili", exact: true }).click();
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: "Modifica in 3D", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );
  const add = page.getByRole("button", {
    name: "Aggiungi curva",
    exact: true,
  });
  await expect(add).toBeVisible();
  const beforeCount = flexible.waypoints.length;
  await add.click();
  const afterHud = await exported(page);
  expect(
    afterHud.ducts!.find((duct) => duct.terminalId)!.waypoints.length,
  ).toBe(beforeCount + 1);
  await page.screenshot({ path: ".cache/flessibili-3d.png" });
});
