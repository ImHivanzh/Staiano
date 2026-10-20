import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

async function saved(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await downloaded).path())!, "utf8")),
  );
}

async function dragWorld(
  page: import("@playwright/test").Page,
  plan: import("@playwright/test").Locator,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const editor = plan.getByTestId("editor-2d");
  const screen = (point: { x: number; y: number }) =>
    editor.evaluate((node, p) => {
      const at = new DOMPoint(p.x, p.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: at.x, y: at.y };
    }, point);
  const start = await screen(from),
    end = await screen(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

test("la base della planimetria si sposta solo con Muovi", async ({ page }) => {
  test.setTimeout(120000);
  const raw = structuredClone(
    JSON.parse(readFileSync(".cache/guided-ui-fixtures.json", "utf8")).empty,
  );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "base-pianta.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await page
    .getByRole("button", { name: "Chiudi wizard", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();
  const start = (await saved(page)).rooms[0].centroid.x;

  // Senza Muovi il trascinamento non deve spostare la planimetria.
  await dragWorld(page, plan, { x: 2.5, y: 5 }, { x: 3.5, y: 5 });
  expect((await saved(page)).rooms[0].centroid.x).toBeCloseTo(start, 2);

  await plan.getByRole("button", { name: "Muovi (M)", exact: true }).click();
  await dragWorld(page, plan, { x: 2.5, y: 5 }, { x: 3.5, y: 5 });
  expect((await saved(page)).rooms[0].centroid.x).toBeCloseTo(start + 1, 1);
});
