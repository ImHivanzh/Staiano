import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024])
  test(`quota del righello leggibile sullo sfondo anche con zoom alto a ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const project = JSON.parse(
      readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
    );
    await page.goto("/");
    project.floors[0].background = {
      dataUrl: await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 500;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 500, 500);
        context.strokeStyle = "#888";
        context.lineWidth = 2;
        context.strokeRect(100, 75, 120, 150);
        context.fillStyle = "#888";
        context.font = "16px sans-serif";
        context.fillText("50,7", 110, 95);
        return canvas.toDataURL("image/png");
      }),
      widthPx: 500,
      heightPx: 500,
      metersPerPixel: 0.02,
      origin: { x: 0, y: 0 },
      opacity: 1,
      filename: "plan-reference.png",
    };
    await page.getByTestId("project-file").setInputFiles({
      name: "measurement.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const continueButton = page.getByRole("button", {
      name: "Continua liberamente nell’editor",
    });
    if (await continueButton.isVisible()) await continueButton.click();
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    const editor = plan.getByTestId("editor-2d");
    await page.locator('summary[aria-label="Disegno e misure"]').click();
    await page.getByRole("button", { name: "Misura", exact: true }).click();
    for (const zoomWidth of [8, 2]) {
      while (
        Number((await editor.getAttribute("viewBox"))!.split(" ")[2]) >
        zoomWidth
      ) {
        const anchor = await editor.evaluate((node) => {
          const point = new DOMPoint(2.25, 2).matrixTransform(
            (node as SVGSVGElement).getScreenCTM()!,
          );
          return { x: point.x, y: point.y };
        });
        await page.mouse.move(anchor.x, anchor.y);
        const previous = await editor.getAttribute("viewBox");
        await page.mouse.wheel(0, -100);
        await expect(editor).not.toHaveAttribute("viewBox", previous!);
      }
      await pickPlanPoint(plan, 2, 2);
      await pickPlanPoint(plan, 2.5, 2);
      const label = editor
        .locator("text.quota-pianta")
        .filter({ hasText: /^0,50 m$/ });
      await expect(label).toBeVisible();
      const labelBox = (await label.boundingBox())!;
      expect(labelBox.width).toBeLessThan(150);
      expect(labelBox.height).toBeLessThan(40);
      const paint = await label.evaluate((node) => {
        const text = node as SVGTextElement;
        const style = getComputedStyle(text);
        const matrix = text.getScreenCTM()!;
        const scale = Math.hypot(matrix.a, matrix.b);
        const stroke =
          parseFloat(style.strokeWidth) *
          (style.vectorEffect === "non-scaling-stroke" ? 1 : scale);
        const last = text.getNumberOfChars() - 1;
        const unit = text.getExtentOfChar(last);
        const digit = text.getExtentOfChar(last - 2);
        return {
          stroke,
          font: parseFloat(style.fontSize) * scale,
          gap: (unit.x - digit.x - digit.width) * scale,
        };
      });
      await label.screenshot({
        path: `.cache/measure-label-${width}-${zoomWidth}.png`,
      });
      expect(
        paint.stroke,
        "Il contorno non deve coprire i caratteri",
      ).toBeLessThanOrEqual(3);
      expect(paint.stroke).toBeLessThan(paint.font / 4);
      expect(
        paint.gap,
        "Numero e unità restano separati",
      ).toBeGreaterThanOrEqual(paint.stroke);
    }
  });
