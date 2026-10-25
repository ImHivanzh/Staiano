import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

test("valves follow the radiator colour, preserve overrides and survive reload", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const { project, chromeProject } = JSON.parse(
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
    import {ensureInstallations} from './src/domain/installations.ts';
    let p=createProject('Valvole in tinta');
    p=addRectangle(p,p.floors[0].id,{width:2,length:2,height:2.7,name:'Bagno'});
    const product=radiatorProducts.find(v=>v.family==='Empoli bianco'&&v.pitchMm===600);
    const solution=sizeRadiators(p.rooms[0].designLoadW,[product],50,{manufacturer:'Lazzarini',family:product.family,numberOfRadiators:1})[0];
    const chrome=radiatorProducts.find(v=>v.family==='Empoli cromato'&&v.pitchMm===600);
    const chromeSolution=sizeRadiators(p.rooms[0].designLoadW,[chrome],50,{manufacturer:'Lazzarini',family:chrome.family,numberOfRadiators:1})[0];
    console.log(JSON.stringify({
      project:ensureInstallations(applyRadiatorSolution(p,p.rooms[0].id,solution,null)),
      chromeProject:{...ensureInstallations(applyRadiatorSolution(p,p.rooms[0].id,chromeSolution,null)),id:crypto.randomUUID()},
    }));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "valvole.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  const showFinishes = async (id = project.radiators[0].id) => {
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(id);
    const show = page.getByRole("button", {
      name: "Mostra proprietà",
      exact: true,
    });
    if ((await show.getAttribute("aria-expanded")) !== "true")
      await show.click();
    await openInspector(page, "Colori e finiture");
  };
  await showFinishes();
  const body = page.getByLabel("Colore radiatore", { exact: true });
  const valve = page.getByLabel("Colore valvola", { exact: true });
  const lockshield = page.getByLabel("Colore detentore", { exact: true });
  await body.selectOption("lazzarini-ral9005-matt");
  for (const select of [valve, lockshield]) {
    await expect(select.locator("option:checked")).toContainText(
      "In tinta radiatore",
    );
    const colour = await select
      .locator("..")
      .locator(".campione-colore")
      .evaluate((el) => (el as HTMLElement).style.backgroundColor);
    expect(colour).toBe(
      await body
        .locator("..")
        .locator(".campione-colore")
        .evaluate((el) => (el as HTMLElement).style.backgroundColor),
    );
  }
  await expect(
    page.getByText(
      "In tinta corpo: disponibilità della finitura accessorio da verificare.",
      { exact: true },
    ),
  ).toHaveCount(2);
  const black = await exportPlenumFixture(page);
  const { finishes, ...thermal } = black.radiators[0];
  expect(thermal).toEqual(project.radiators[0]);
  expect(finishes?.valveColorId).toBeUndefined();
  const chromeId = await valve
    .locator("option")
    .evaluateAll(
      (nodes) =>
        (
          nodes.find((n) =>
            /crom/i.test(n.textContent ?? ""),
          ) as HTMLOptionElement
        )?.value,
    );
  expect(chromeId).toBeTruthy();
  await valve.selectOption(chromeId!);
  await body.selectOption("");
  await expect(valve).toHaveValue(chromeId!);
  await valve.selectOption("");
  await body.selectOption("lazzarini-ral9005-matt");
  const saved = (await exportPlenumFixture(page)).radiators;
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await openDisclosure(viewer, "Vista 3D");
  await viewer
    .getByRole("button", { name: "Avvicina selezione", exact: true })
    .click();
  await viewer
    .locator("summary")
    .filter({ hasText: "Vista 3D" })
    .first()
    .click();
  await page.screenshot({ path: info.outputPath("radiator-black-valves.png") });
  await page.reload();
  expect((await exportPlenumFixture(page)).radiators).toEqual(saved);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await showFinishes();
  await expect(valve.locator("option:checked")).toContainText(
    "In tinta radiatore",
  );
  await expect(lockshield.locator("option:checked")).toContainText(
    "In tinta radiatore",
  );
  await page.getByTestId("project-file").setInputFiles({
    name: "cromato.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(chromeProject)),
  });
  await showFinishes(chromeProject.radiators[0].id);
  await expect(valve.locator("option:checked")).toContainText("Standard");
  await expect(lockshield.locator("option:checked")).toContainText("Standard");
  for (const select of [valve, lockshield]) {
    await expect(
      select.getByRole("option", { name: "Bianco (generico)", exact: true }),
    ).toBeAttached();
    await expect(
      select.getByRole("option", { name: "Cromo (generico)", exact: true }),
    ).toBeAttached();
  }
  await valve.selectOption("generic-white");
  await lockshield.selectOption("generic-chrome");
  await expect(valve.locator("..").locator(".campione-colore")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(lockshield.locator("..").locator(".campione-colore")).toHaveCSS(
    "background-color",
    "rgb(198, 203, 208)",
  );
  await expect(
    valve.locator("..").getByRole("link", { name: "Palette ufficiale" }),
  ).toHaveCount(0);
  const generics = (await exportPlenumFixture(page)).radiators;
  expect(generics[0].finishes).toMatchObject({
    valveColorId: "generic-white",
    lockshieldColorId: "generic-chrome",
  });
  await page.reload();
  await showFinishes(chromeProject.radiators[0].id);
  await expect(valve).toHaveValue("generic-white");
  await expect(lockshield).toHaveValue("generic-chrome");
  expect((await exportPlenumFixture(page)).radiators).toEqual(generics);
});
