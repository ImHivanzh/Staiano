import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

for (const width of [600, 750]) {
  test(`Empoli ${width} mm renders its documented profiles and central mirror`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const project = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      import {createProject,addRectangle} from './src/domain/project.ts';
      import {radiatorProducts} from './src/domain/catalogs/radiators.ts';
      import {sizeRadiators} from './src/domain/radiators/size.ts';
      import {applyRadiatorSolution} from './src/domain/radiators/apply.ts';
      let p=createProject('Empoli ${width}');
      p=addRectangle(p,p.floors[0].id,{width:2,length:2,height:2.7,name:'Bagno'});
      const product=radiatorProducts.find(v=>v.family==='Empoli bianco'&&v.pitchMm===${width});
      const solution=sizeRadiators(p.rooms[0].designLoadW,[product],50,{manufacturer:'Lazzarini',family:product.family,numberOfRadiators:1})[0];
      console.log(JSON.stringify(applyRadiatorSolution(p,p.rooms[0].id,solution,null)));
    `,
        ],
        { encoding: "utf8" },
      ),
    );
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "empoli.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(project.radiators[0].id);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d"),
      canvas = viewer.locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await openDisclosure(viewer, "Vista 3D");
    await viewer
      .getByRole("button", { name: "Avvicina selezione", exact: true })
      .click();
    const menu = viewer
      .locator("summary")
      .filter({ hasText: "Vista 3D" })
      .first();
    if (
      await menu.evaluate(
        (node) => (node.parentElement as HTMLDetailsElement).open,
      )
    )
      await menu.click();
    await expect(canvas).toHaveAttribute(
      "data-selection",
      project.radiators[0].id,
    );
    await page.screenshot({ path: info.outputPath(`empoli-${width}.png`) });
  });
}

for (const [columns, height] of [
  [2, 207],
  [3, 600],
  [4, 900],
  [5, 1800],
  [6, 2500],
])
  test(`Ardesia ${columns} colonne H${height}: profilo originale, altezza e salvataggio invariati`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const project = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
    import {createProject,addRectangle} from './src/domain/project.ts';
    import {radiatorProducts} from './src/domain/catalogs/radiators.ts';
    import {applyRadiatorSolution} from './src/domain/radiators/apply.ts';
    import {sizeRadiators} from './src/domain/radiators/size.ts';
    import {ensureInstallations} from './src/domain/installations.ts';
    let p=createProject('Ardesia ${columns} H${height}');p=addRectangle(p,p.floors[0].id,{width:2,length:2,height:3,name:'Stanza'});
    const product=radiatorProducts.find(v=>v.id==='cordivari-ardesia-${columns}-${height}');
    const solution=sizeRadiators(p.rooms[0].designLoadW,[product],50,{manufacturer:'Cordivari',family:product.family,numberOfRadiators:1})[0];
    console.log(JSON.stringify(ensureInstallations(applyRadiatorSolution(p,p.rooms[0].id,solution,null))));
  `,
        ],
        { encoding: "utf8" },
      ),
    );
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "ardesia-corpo.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(project.radiators[0].id);
    const show = page.getByRole("button", {
      name: "Mostra proprietà",
      exact: true,
    });
    if ((await show.getAttribute("aria-expanded")) !== "true")
      await show.click();
    await openInspector(page, "Dettagli tecnici");
    await expect(page.locator(".corpo-proprieta")).toContainText(
      "Corpo 3D ricostruito dal profilo originale Cordivari",
    );
    const asset = page.waitForResponse((r) =>
      r.url().endsWith(`/models3d/ardesia-section-${columns}.glb`),
    );
    await page.getByRole("button", { name: "3D", exact: true }).click();
    expect((await asset).status()).toBe(200);
    const viewer = page.getByTestId("viewer-3d"),
      canvas = viewer.locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await openDisclosure(viewer, "Vista 3D");
    await viewer
      .getByRole("button", { name: "Avvicina selezione", exact: true })
      .click();
    const menu = viewer
      .locator("summary")
      .filter({ hasText: "Vista 3D" })
      .first();
    if (
      await menu.evaluate(
        (node) => (node.parentElement as HTMLDetailsElement).open,
      )
    )
      await menu.click();
    expect((await exportPlenumFixture(page)).radiators).toEqual(
      project.radiators,
    );
    let expected = project.radiators;
    if (columns === 2) {
      await page.screenshot({
        path: info.outputPath("ardesia-before-colour.png"),
      });
      await page.getByRole("button", { name: "2D", exact: true }).click();
      if ((await show.getAttribute("aria-expanded")) !== "true")
        await show.click();
      await openInspector(page, "Colori e finiture");
      const colour = page.getByLabel("Colore radiatore", { exact: true });
      const chosen = await colour
        .locator("option")
        .evaluateAll(
          (options) =>
            (
              options.find((option) =>
                /nero/i.test(option.textContent ?? ""),
              ) as HTMLOptionElement
            )?.value,
        );
      expect(chosen).toBeTruthy();
      await colour.selectOption(chosen!);
      const saved = await exportPlenumFixture(page);
      const { finishes, ...unchanged } = saved.radiators[0];
      expect(unchanged).toEqual(project.radiators[0]);
      expect(finishes?.bodyColorId).toBe(chosen);
      expected = saved.radiators;
      await page.getByRole("button", { name: "3D", exact: true }).click();
      await expect(canvas).toHaveAttribute("data-rendered", "true");
      const actions = page.getByRole("group", {
        name: "Comandi rapidi progetto",
      });
      await actions
        .getByRole("button", { name: "Annulla", exact: true })
        .click();
      expect((await exportPlenumFixture(page)).radiators).toEqual(
        project.radiators,
      );
      await page.screenshot({
        path: info.outputPath("ardesia-undo-colour.png"),
      });
      await actions
        .getByRole("button", { name: "Ripristina", exact: true })
        .click();
      expect((await exportPlenumFixture(page)).radiators).toEqual(expected);
    }
    await page.screenshot({
      path: info.outputPath(`ardesia-${columns}-${height}.png`),
    });
    await page.reload();
    await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
    expect((await exportPlenumFixture(page)).radiators).toEqual(expected);
  });
