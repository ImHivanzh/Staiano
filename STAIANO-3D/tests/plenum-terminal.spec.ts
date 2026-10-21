import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { dragPlanDevice, openDisclosure } from "./ui-helpers";

function projectWithoutPlenum() {
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
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    p.rooms[0].ceilingHeightM = 2.4;
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function importProject(page: Page) {
  const project = projectWithoutPlenum();
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "plenum-bocchetta.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(0);
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

test("Plenum crea il plenum della bocchetta come elemento autonomo", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await importProject(page);
  const tool = page.getByRole("button", { name: "Plenum", exact: true });
  await tool.click();
  await page.getByTestId("terminal-supply").first().click();
  await expect(
    page.getByText(/Plenum creato e collegato alla bocchetta/),
  ).toBeVisible();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  const after = await exportProject(page);
  const terminal = after.airTerminals.find(
    (item) => item.id === before.airTerminals[0].id,
  )!;
  const plenum = after.plenums.find(
    (item) => item.attachmentId === terminal.id,
  )!;
  expect(plenum).toBeDefined();
  expect(plenum.status).toBe("proposed");
  expect(terminal.plenumId).toBe(plenum.id);
  expect(after.ducts).toHaveLength(plenum.portCount ?? 1);
  await page.screenshot({ path: ".cache/plenum-bocchetta-2d.png" });
});

test("cliccare di nuovo la stessa bocchetta seleziona il plenum esistente senza duplicarlo", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await importProject(page);
  const tool = page.getByRole("button", { name: "Plenum", exact: true });
  await tool.click();
  await page.getByTestId("terminal-supply").first().click();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await tool.click();
  await page.getByTestId("terminal-supply").first().click();
  await expect(
    page.getByText(/La bocchetta ha già il suo plenum/),
  ).toBeVisible();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
});

test("il plenum resta dove lo sposta l'operatore mentre la bocchetta si muove", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await importProject(page);
  await page.getByRole("button", { name: "Plenum", exact: true }).click();
  await page.getByTestId("terminal-supply").first().click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  const moveTool = page.getByRole("button", { name: "Muovi (M)" });
  await moveTool.click();
  await dragPlanDevice(page, plan, plan.getByTestId("plenum-2d"), 4, 2);
  const placed = await exportProject(page);
  expect(placed.plenums[0].status).toBe("manual");
  const plenumPosition = placed.plenums[0].position;
  await moveTool.click();
  await dragPlanDevice(
    page,
    plan,
    plan.getByTestId("terminal-supply").first(),
    5,
    3,
  );
  const after = await exportProject(page);
  expect(after.airTerminals[0].position).not.toEqual(
    before.airTerminals[0].position,
  );
  // La bocchetta si è spostata; il plenum resta nella posa scelta dall'operatore.
  expect(after.plenums[0].position).toEqual(plenumPosition);
});
