import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024])
  test(`lunghezza muro da tastiera senza focus e conferma con Invio a ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "lunghezza-esatta.hvacproj",
      mimeType: "application/json",
      buffer: readFileSync("tests/fixtures/unconfigured-connections.json"),
    });
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    const editor = plan.getByTestId("editor-2d");
    const walls = plan.getByTestId("wall");
    await page.keyboard.press("l");
    await pickPlanPoint(plan, 4, 3);
    const direction = await editor.evaluate((node) => {
      const at = new DOMPoint(5, 3).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: at.x, y: at.y };
    });
    await page.mouse.move(direction.x, direction.y);
    const length = page.getByLabel("Lunghezza esatta nuovo muro");
    await expect(length).not.toBeFocused();
    await page.keyboard.type("3.50");
    await page.keyboard.press("Backspace");
    await expect(length).toHaveValue("3.5");
    await expect(length).not.toBeFocused();
    await page.keyboard.press("Delete");
    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await expect(walls).toHaveCount(4);
    await expect(
      page.getByRole("alert").filter({ hasText: "Lunghezza del muro" }),
    ).toBeVisible();
    await page.keyboard.press("Delete");
    await page.keyboard.type("3.5");
    await page.keyboard.press("Enter");
    await expect(walls).toHaveCount(5);
    await expect(length).toHaveValue("");
    const next = await editor.evaluate((node) => {
      const at = new DOMPoint(7.5, 4).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: at.x, y: at.y };
    });
    await page.mouse.move(next.x, next.y);
    await length.fill("1,25");
    await length.press("Enter");
    await expect(walls).toHaveCount(6);
    await expect(length).toHaveValue("");
    await page.getByRole("button", { name: "Aumenta zoom", exact: true }).focus();
    await page.keyboard.type("2");
    await page.keyboard.press("Escape");
    await page.keyboard.press("l");
    await expect(length).toHaveValue("");
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const result = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    const added = result.walls.slice(-2);
    expect(added[0].start).toEqual({ x: 4, y: 3 });
    expect(added[0].end.x).toBeCloseTo(7.5, 5);
    expect(added[0].end.y).toBeCloseTo(3, 5);
    expect(added[1].end.x).toBeCloseTo(7.5, 5);
    expect(added[1].end.y).toBeCloseTo(4.25, 5);
    await page.screenshot({ path: `.cache/lunghezza-esatta-${width}.png` });
  });
