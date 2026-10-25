import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

function plenumProject(wall = false) {
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
    import { placeSupplyPlenum } from './src/domain/ducted/placement.ts';
    import { movePlacedDevice } from './src/domain/geometry/move-device.ts';
    let p = guidedProjectFixture();
    p.floors[0].configurationWizard = undefined;
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
    p = addGuidedTerminal(p, 2000, '${wall ? "EDLH" : "EDLS"}', '${wall ? "wall" : "ceiling"}');
    p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
    p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
    p = placeSupplyPlenum(p, p.hvacSystems[0].id);
    if (${wall}) p = movePlacedDevice(p, p.airTerminals[0].id, { x: 0.2, y: 3 }, {
      enabled: true, grid: false, stepM: 0.1, toleranceM: 0.12,
      orthogonal: false, angle45: false, parallel: false,
    });
    p = { ...p, ducts: [] };
    console.log(JSON.stringify(p));
  `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
}

async function saved(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(
      readFileSync((await (await downloaded).path())!.toString(), "utf8"),
    ),
  );
}

/** Il canale parte dal plenum: primo punto già sullo stacco, poi la macchina. */
for (const wall of [false, true])
  test(`il plenum è il primo estremo e la macchina chiude il percorso ${wall ? "da correggere a parete" : "predefinito"}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const project = plenumProject(wall);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "canale-dal-plenum.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const free = page.getByRole("button", {
      name: "Continua liberamente nell’editor",
    });
    if (await free.count()) await free.click();
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await expect(plan).toBeVisible();

    await plan.getByRole("button", { name: "Canale", exact: true }).click();
    // Primo estremo: il plenum della bocchetta (il secondo è quello macchina).
    await plan.getByTestId("plenum-2d").first().locator("rect").click();
    await expect(plan.getByTestId("duct-anchor")).toBeVisible();
    await expect(page.getByText(/Plenum selezionato/).first()).toBeVisible();
    await page.screenshot({ path: ".cache/canale-plenum-selezionato.png" });
    // Secondo estremo: la macchina. Il percorso viene proposto e reso modificabile.
    await plan
      .getByRole("button", { name: /^Macchina / })
      .first()
      .click();

    await expect(page.getByText(/Canale creato/)).toBeVisible();
    await expect(
      plan.getByRole("button", { name: "Canale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(plan.getByTestId("duct-2d").first()).toBeVisible();
    await page.screenshot({ path: ".cache/canale-dal-plenum-2d.png" });
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const canvas = page.getByTestId("viewer-3d").locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-duct-count", /^[1-9]/);
    await page.screenshot({ path: ".cache/canale-dal-plenum-3d.png" });
    if (wall) {
      await page
        .getByRole("button", { name: "Flessibili", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Modifica grafica flessibili" })
        .getByRole("button", { name: "Aggiungi curva", exact: true })
        .click();
    }
    const result = await saved(page);
    const terminalId = result.airTerminals[0].id;
    const ducts = result.ducts?.filter(
      (item) => item.terminalId === terminalId,
    );
    expect(ducts?.length, "un tubo per stacco del plenum").toBeGreaterThan(0);
    for (const duct of ducts!) {
      expect(duct.routing).toBe("manual");
      expect(duct.waypoints.length).toBeGreaterThan(0);
      expect(duct.shape).toBe("circle");
      expect(duct.diameterMm).toBeGreaterThan(0);
    }
    if (wall) expect(ducts![0].waypoints.length).toBeGreaterThan(2);
  });
