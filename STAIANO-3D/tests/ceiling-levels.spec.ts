import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

test("flat suspended ceiling updates finished height, technical void and thermal volume", async ({
  page,
}) => {
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
    const p=createProject(); console.log(JSON.stringify(addRectangle(p,p.floors[0].id,{width:8,length:12,height:3,name:'Sala'})));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "controsoffitto.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole("button", { name: /Sala/ }).click();
  const show = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await show.getAttribute("aria-expanded")) !== "true") await show.click();
  await openInspector(page, "Modifica stanza");
  await page
    .getByRole("checkbox", { name: "Controsoffitto", exact: true })
    .check();
  await page
    .getByRole("spinbutton", { name: "Quota controsoffitto", exact: true })
    .fill("2.5");
  await page
    .getByRole("button", { name: "Applica proprietà", exact: true })
    .click();
  await expect(page.getByTestId("ceiling-void")).toContainText("50,00 cm");
  await expect(page.locator(".dati-stanza")).toContainText("Altezza finita");
  const saved = await exportPlenumFixture(page);
  expect(saved.rooms[0].volumeM3).toBeCloseTo(240);
  expect(saved.rooms[0].designLoadW).toBeCloseTo(
    saved.rooms[0].volumeM3 * saved.projectSettings.coefficientWm3,
  );
  await page.reload();
  await page.getByRole("button", { name: /Sala/ }).click();
  if ((await show.getAttribute("aria-expanded")) !== "true") await show.click();
  await expect(page.getByTestId("ceiling-void")).toContainText("50,00 cm");
  await page.screenshot({ path: ".cache/audit-ceiling-flat.png" });
});

for (const width of [1920, 1024])
  test(`tetto a due falde e ribassamenti laterali a ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(15000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const project = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
    import { createProject, addRectangle } from './src/domain/project.ts';
    const p=createProject('Sala con tetto a due falde');
    console.log(JSON.stringify(addRectangle(p,p.floors[0].id,{width:8,length:12,height:3,name:'Sala'})));
  `,
        ],
        { encoding: "utf8" },
      ),
    );
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "tetto.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByRole("button", { name: /Sala/ }).click();
    const show = page.getByRole("button", {
      name: "Mostra proprietà",
      exact: true,
    });
    if ((await show.getAttribute("aria-expanded")) !== "true")
      await show.click();
    await openInspector(page, "Modifica stanza");
    const panel = page.getByTestId("ceiling-design");
    await panel.locator("summary").first().click();
    await panel.getByLabel("Tetto a due falde", { exact: true }).check();
    await panel
      .getByLabel("Colmo parallelo a")
      .selectOption(project.rooms[0].wallIds[1]);
    await panel.getByLabel("Quota colmo (m)").fill("4");
    await panel
      .getByRole("button", { name: "Applica tetto", exact: true })
      .click();
    await panel.getByText("Aggiungi fascia ribassata", { exact: true }).click();
    for (const wallId of [
      project.rooms[0].wallIds[1],
      project.rooms[0].wallIds[3],
    ]) {
      const form = panel.locator("form").filter({
        has: page.getByRole("button", {
          name: "Aggiungi fascia",
          exact: true,
        }),
      });
      await form.getByLabel("Parete di riferimento").selectOption(wallId);
      await form.getByLabel("Lunghezza fascia (m)").fill("12");
      await form.getByLabel("Larghezza fascia verso la stanza (m)").fill("0.8");
      await form.getByLabel("Quota inferiore fascia (m)").fill("2.4");
      await form
        .getByRole("button", { name: "Aggiungi fascia", exact: true })
        .click();
    }
    await expect(page.getByTestId("ceiling-band-2d")).toHaveCount(2);
    const saved = await exportPlenumFixture(page);
    expect(saved.rooms[0].roof?.ridgeHeightM).toBe(4);
    expect(saved.rooms[0].ceilingBands).toHaveLength(2);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
    );
    await page.screenshot({ path: `.cache/tetto-esterno-${width}.png` });
    await openDisclosure(viewer, "Vista 3D");
    await viewer
      .getByRole("button", { name: "Vista interna", exact: true })
      .click();
    await page.mouse.click(width - 30, 300);
    await page.screenshot({ path: `.cache/tetto-interno-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

for (const type of ["split", "vrv"] as const)
  test(`${type}: quota locale sotto una fascia stretta, persistenza e vista 3D`, async ({
    page,
  }) => {
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
      import {applySplitSystem} from './src/domain/air-conditioning/apply.ts';
      import {applyVrvSystem} from './src/domain/air-conditioning/vrv-apply.ts';
      import {roomWallSpan} from './src/domain/geometry/placement.ts';
      const empty=createProject('Soffitto locale ${type}');
      let p=addRectangle(empty,empty.floors[0].id,{width:4.2,length:3.8,height:2.7,name:'Camera'});
      p='${type}'==='split'?applySplitSystem(p,[p.rooms[0].id],'Daikin',null):applyVrvSystem(p,[p.rooms[0].id],null);
      const room=p.rooms[0],unit=p.hvacSystems[0].indoorUnits[0],wall=p.walls.find(w=>w.id===unit.wallId),span=roomWallSpan(room,wall);
      room.ceilingBands=[{id:'narrow-band',name:'Fascia stretta',wallId:wall.id,offsetM:span.lengthM/2+unit.widthMm/4000,lengthM:unit.widthMm/8000,depthM:0.8,elevationM:2.1}];
      console.log(JSON.stringify(p));
    `,
        ],
        { encoding: "utf8" },
      ),
    );
    const unit = project.hvacSystems[0].indoorUnits[0];
    const expected = (2 - unit.heightMm / 2000).toLocaleString("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page
      .getByTestId("project-file")
      .setInputFiles({
        name: "soffitto-locale.hvacproj",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await expect(
      page.getByRole("heading", {
        name: `Soffitto locale ${type}`,
        exact: true,
      }),
    ).toBeVisible();
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(unit.id);
    const show = page.getByRole("button", {
      name: "Mostra proprietà",
      exact: true,
    });
    if ((await show.getAttribute("aria-expanded")) !== "true")
      await show.click();
    await expect(page.locator(".corpo-proprieta")).toContainText(
      `Quota centro ${expected} m`,
    );
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(
      page.getByTestId("viewer-3d").locator("canvas"),
    ).toHaveAttribute("data-rendered", "true");
    const saved = await exportPlenumFixture(page);
    expect(saved.hvacSystems[0].indoorUnits).toEqual(
      project.hvacSystems[0].indoorUnits,
    );
    expect(saved.rooms[0].ceilingBands).toEqual(project.rooms[0].ceilingBands);
    await page.reload();
    await expect(page.getByTestId(`${type}-2d`)).toHaveCount(1);
    expect(
      (await exportPlenumFixture(page)).hvacSystems[0].indoorUnits,
    ).toEqual(project.hvacSystems[0].indoorUnits);
  });
