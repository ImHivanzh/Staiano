import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

function fixture() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
 import {guidedProjectFixture,addGuidedTerminal} from './tests/guided-fixture.ts';
 import {placeMachineOnPlan} from './src/domain/ducted/graphic-installation.ts';
 import {movePlacedDevice} from './src/domain/geometry/move-device.ts';
 import {insertPlenum,connectPlenum} from './src/domain/ducted/attached-plenums.ts';
 let p=guidedProjectFixture();p.floors[0].configurationWizard=undefined;
 p=placeMachineOnPlan(p,p.hvacSystems[0].id,p.rooms[0].id,{x:3,y:3});p=addGuidedTerminal(p,2000,'EDLS','wall');
 p=movePlacedDevice(p,p.airTerminals[0].id,{x:.2,y:3},{enabled:true,grid:false,stepM:.1,toleranceM:.12,orthogonal:false,angle45:false,parallel:false});
 p=insertPlenum(p,p.rooms[0].id,{x:1,y:1});p=connectPlenum(p,p.plenums[0].id,p.airTerminals[0].id);
 console.log(JSON.stringify(p));
 `,
      ],
      { encoding: "utf8" },
    ),
  );
}

for (const offset of [30, -30])
  test(`Cartongesso: ${offset} cm, vuoto laterale e due tubi`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({
      width: offset > 0 ? 1600 : 1024,
      height: offset > 0 ? 900 : 768,
    });
    const project = fixture();
    project.airTerminals[0].commercialOptions = {
      insulatedPlenum: true,
      fixingBridges: true,
      continuityKit: true,
      connectionPosition: "upper",
    };
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "controparete.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const free = page.getByRole("button", {
      name: "Continua liberamente nell’editor",
    });
    if (await free.count()) await free.click();
    const original = project.walls.findIndex(
      (w: { id: string }) => w.id === project.airTerminals[0].wallId,
    );
    const side =
      project.rooms[0].wallIds[
        (project.rooms[0].wallIds.indexOf(project.airTerminals[0].wallId) + 1) %
          project.rooms[0].wallIds.length
      ];
    for (const index of [
      original,
      project.walls.findIndex((w: { id: string }) => w.id === side),
    ]) {
      const wall = project.walls[index];
      await pickPlanPoint(
        page.getByRole("region", {
          name: "Configurazione grafica canalizzato",
        }),
        wall.start.x + (wall.end.x - wall.start.x) * 0.25,
        wall.start.y + (wall.end.y - wall.start.y) * 0.25,
      );
      const show = page.getByRole("button", {
        name: "Mostra proprietà",
        exact: true,
      });
      if (
        (await show.count()) &&
        (await show.getAttribute("aria-expanded")) === "false"
      )
        await show.click();
      const properties = page.getByTestId("drywall-properties");
      if ((await properties.getAttribute("open")) === null)
        await properties.locator("summary").click();
      await properties
        .getByRole("spinbutton", { name: "Scostamento cartongesso (cm)" })
        .fill(String(offset));
      await properties
        .getByRole("button", { name: "Applica cartongesso", exact: true })
        .click();
    }
    await expect(page.getByTestId("drywall-2d")).toHaveCount(2);
    await page.screenshot({ path: `.cache/drywall-${offset}-2d.png` });
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const canvas = page.getByTestId("viewer-3d").locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-drywall-count", "2");
    await expect(canvas).toHaveAttribute("data-duct-count", "2");
    await expect(
      page.getByText("Percorso non realizzabile: sposta curve o plenum"),
    ).toHaveCount(0);
    await page.screenshot({ path: `.cache/drywall-${offset}-3d.png` });
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const saved = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(
      saved.walls.filter(
        (w: { drywall?: { offsetM: number } }) =>
          w.drywall?.offsetM === offset / 100,
      ),
    ).toHaveLength(2);
  });
