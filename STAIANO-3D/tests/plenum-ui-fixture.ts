import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { projectSchema } from "../src/schemas/project";
import { expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

export function plenumFixture(
  attached = false,
  use: "supply" | "return" = "supply",
) {
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
    import { insertPlenum, connectPlenum } from './src/domain/ducted/attached-plenums.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    p.rooms[0].ceilingHeightM = 2.4;
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 1000);
    p = insertPlenum(p, p.rooms[0].id, { x: 5, y: 4 });
    if ("${use}" === "return")
      p = {
        ...p,
        plenums: p.plenums.map((pl) => ({ ...pl, use: "return" })),
      };
    if (${attached}) p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

export async function importPlenumFixture(
  page: Page,
  attached = false,
  use: "supply" | "return" = "supply",
) {
  const project = plenumFixture(attached, use);
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

export async function exportPlenumFixture(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}
