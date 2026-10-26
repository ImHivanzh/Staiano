import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024])
  test(`frecce vincolano direzione e anteprima muro a ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "assi-muri.hvacproj",
      mimeType: "application/json",
      buffer: readFileSync("tests/fixtures/unconfigured-connections.json"),
    });
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    const editor = plan.getByTestId("editor-2d");
    const preview = editor.locator("line.tratto-provvisorio");
    const locked = editor.locator("line.asse-bloccato");
    const length = page.getByLabel("Lunghezza esatta nuovo muro");
    async function move(x: number, y: number) {
      const at = await editor.evaluate(
        (node, point) => {
          const screen = new DOMPoint(point.x, point.y).matrixTransform(
            (node as SVGSVGElement).getScreenCTM()!,
          );
          return { x: screen.x, y: screen.y };
        },
        { x, y },
      );
      await page.mouse.move(at.x, at.y);
      return at;
    }
    await page.keyboard.press("l");
    await pickPlanPoint(plan, 2, 2);
    const normalStyle = await preview.evaluate((node) => ({
      color: getComputedStyle(node).stroke,
      width: Number(node.getAttribute("stroke-width")),
    }));
    await page.keyboard.press("ArrowRight");
    await expect(locked).toHaveCount(1);
    await page.keyboard.type("1");
    await expect(locked).toHaveAttribute("x2", "3");
    await expect(locked).toHaveAttribute("y2", "2");
    const lockedStyle = await locked.evaluate((node) => ({
      color: getComputedStyle(node).stroke,
      width: Number(node.getAttribute("stroke-width")),
    }));
    expect(lockedStyle.color).not.toBe(normalStyle.color);
    expect(lockedStyle.width).toBeCloseTo(normalStyle.width * 1.5);
    await page.screenshot({ path: `.cache/asse-bloccato-${width}.png` });
    await page.keyboard.press("Enter");
    await expect(plan.getByTestId("wall")).toHaveCount(5);
    await expect(locked).toHaveCount(0);
    await expect(length).toHaveValue("");

    for (const step of [
      { key: "ArrowDown", mouse: [4.3, 4], end: [3, 4] },
      { key: "ArrowLeft", mouse: [1.5, 4.8], end: [1.5, 4] },
      { key: "ArrowUp", mouse: [1, 3], end: [1.5, 3] },
    ]) {
      const at = await move(step.mouse[0], step.mouse[1]);
      await page.keyboard.press(step.key);
      await expect(locked).toHaveAttribute("x2", String(step.end[0]));
      await expect(locked).toHaveAttribute("y2", String(step.end[1]));
      await page.mouse.click(at.x, at.y);
      await expect(locked).toHaveCount(0);
    }

    await move(3, 2.7);
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.down("ArrowLeft");
    await page.keyboard.up("ArrowLeft");
    await expect(locked).toHaveAttribute("x2", "1.5");
    await page.keyboard.press("ArrowLeft");
    await expect(locked).toHaveCount(0);
    await expect(preview).toHaveAttribute("x2", "3");
    await page.keyboard.press("ArrowRight");
    await length.fill("2");
    await length.press("ArrowLeft");
    await expect(locked).toHaveAttribute("x2", "3.5");
    await page
      .getByRole("button", { name: "Aumenta zoom", exact: true })
      .focus();
    await page.keyboard.press("Escape");
    await page.keyboard.press("l");
    await expect(locked).toHaveCount(0);
    await expect(length).toHaveValue("");

    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const result = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(
      result.walls
        .slice(-4)
        .map((wall: { start: unknown; end: unknown }) => [
          wall.start,
          wall.end,
        ]),
    ).toEqual([
      [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
      [
        { x: 3, y: 2 },
        { x: 3, y: 4 },
      ],
      [
        { x: 3, y: 4 },
        { x: 1.5, y: 4 },
      ],
      [
        { x: 1.5, y: 4 },
        { x: 1.5, y: 3 },
      ],
    ]);
  });
