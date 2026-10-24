import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import type { Project } from "../src/schemas/project";

for (const historical of [false, true])
  test(`split outdoor dimensions: ${historical ? "historic footprint survives reload" : "published footprint and source"}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const project: Project = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      import { createProject, addRectangle } from './src/domain/project.ts';
      import { splitCatalog, splitCatalogAtVersion } from './src/domain/catalogs/splits.ts';
      import { sizeSplitSystems } from './src/domain/air-conditioning/size.ts';
      import { splitSystemFromSolution } from './src/domain/air-conditioning/apply.ts';
      const empty = createProject();
      const p = addRectangle(empty, empty.floors[0].id, {width:4.2,length:3.8,height:2.7,name:'Camera'});
      const catalog = ${historical ? "splitCatalogAtVersion('split-5fca5af2b8c15f02')" : "splitCatalog"};
      const solution = sizeSplitSystems(p,[p.rooms[0].id],'Daikin',catalog).find(s=>s.combination.outdoorModel==='RXM25A9');
      if (!solution) throw new Error('Fixture requires approved RXM25A9 combination');
      console.log(JSON.stringify({...p,hvacSystems:[splitSystemFromSolution(p,solution,catalog,null)]}));
    `,
        ],
        { encoding: "utf8" },
      ),
    );
    const outdoor = project.hvacSystems[0].outdoorUnit!;
    expect([outdoor.widthMm, outdoor.heightMm, outdoor.depthMm]).toEqual(
      historical ? [780, 550, 290] : [923, 610, 367],
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "split-outdoor.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(outdoor.id);
    const show = page.getByRole("button", {
      name: "Mostra proprietà",
      exact: true,
    });
    if ((await show.getAttribute("aria-expanded")) !== "true")
      await show.click();
    const inspector = page.locator(".proprieta");
    await expect(inspector).toContainText(
      `Ingombro L×H×P ${outdoor.widthMm}×${outdoor.heightMm}×${outdoor.depthMm} mm`,
    );
    const source = inspector.getByRole("link", {
      name: /Dimensioni pubblicate/,
    });
    if (historical) {
      await expect(source).toHaveCount(0);
      await expect(inspector.getByRole("status")).toContainText(
        "Ingombro indicativo",
      );
    } else {
      await expect(source).toHaveAttribute(
        "href",
        /Leaflet%20Perfera%202025\.pdf$/,
      );
      await expect(source).toContainText("pagina 6");
      await expect(
        inspector.getByText("Ingombro indicativo", { exact: false }),
      ).toHaveCount(0);
    }
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.reload();
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await openDisclosure(page, "File");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const loaded: Project = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(loaded.hvacSystems[0].catalogVersion).toBe(
      project.hvacSystems[0].catalogVersion,
    );
    expect(loaded.hvacSystems[0].outdoorUnit).toEqual(outdoor);
  });
