import { execFileSync } from "node:child_process";
import { test, expect } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

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
