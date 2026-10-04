import type { Locator } from "@playwright/test";
import { expect, test } from "./browser-test";

async function screenPoint(preview: Locator, x: number, y: number) {
  return preview.evaluate(
    (element, point) => {
      const matrix = (element as SVGSVGElement).getScreenCTM();
      if (!matrix) throw new Error("Anteprima senza matrice");
      const position = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: position.x, y: position.y };
    },
    { x, y },
  );
}

test("zoom e trascinamento mantengono punti e scala dello sfondo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 800, 600);
    context.strokeRect(100, 100, 600, 400);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  const file = {
    name: "pianta.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  };
  await dialog
    .getByLabel("File planimetria", { exact: true })
    .setInputFiles(file);
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  await expect(preview.locator("image")).toBeVisible();
  const originalView = await preview.getAttribute("viewBox");
  const first = await screenPoint(preview, 300, 300);
  await page.mouse.click(first.x, first.y);
  const firstX = await preview.locator("circle").getAttribute("cx");
  await dialog.getByRole("button", { name: "Aumenta zoom anteprima" }).click();
  await expect(dialog.getByLabel("Zoom anteprima", { exact: true })).toHaveText(
    "125%",
  );

  const anchorBefore = await screenPoint(preview, 420, 300);
  await page.mouse.move(anchorBefore.x, anchorBefore.y);
  await page.mouse.wheel(0, -120);
  await expect(dialog.getByLabel("Zoom anteprima", { exact: true })).toHaveText(
    "156%",
  );
  const anchorAfter = await screenPoint(preview, 420, 300);
  expect(Math.abs(anchorAfter.x - anchorBefore.x)).toBeLessThan(1);
  expect(Math.abs(anchorAfter.y - anchorBefore.y)).toBeLessThan(1);

  const beforeDrag = await preview.getAttribute("viewBox");
  await page.mouse.move(anchorAfter.x, anchorAfter.y);
  await page.mouse.down();
  await page.mouse.move(anchorAfter.x + 45, anchorAfter.y + 25, { steps: 8 });
  await page.mouse.up();
  await expect(preview).not.toHaveAttribute("viewBox", beforeDrag!);
  await expect(preview.locator("circle")).toHaveCount(1);
  await expect(preview.locator("circle")).toHaveAttribute("cx", firstX!);

  const second = await screenPoint(preview, 500, 300);
  await page.mouse.click(second.x, second.y);
  await expect(preview.locator("circle")).toHaveCount(2);
  const coordinates = await preview.locator("circle").evaluateAll((circles) =>
    circles.map((circle) => ({
      x: Number(circle.getAttribute("cx")),
      y: Number(circle.getAttribute("cy")),
    })),
  );
  expect(Math.abs(coordinates[0].x - 300)).toBeLessThan(1.5);
  expect(Math.abs(coordinates[1].x - 500)).toBeLessThan(1.5);
  expect(Math.abs(coordinates[1].y - 300)).toBeLessThan(1.5);
  await dialog.getByLabel("Distanza reale di riferimento").fill("4");
  await dialog
    .getByRole("button", { name: "Calibra scala", exact: true })
    .click();
  const scaleText = await dialog.getByText(/1 unità anteprima/).textContent();
  expect(Number(scaleText?.match(/= ([\d.]+) m/)?.[1])).toBeCloseTo(0.02, 3);
  await expect(
    dialog.getByLabel("Ho verificato la scala su una misura reale"),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Adatta anteprima" }).click();
  await expect(preview).toHaveAttribute("viewBox", originalView!);
  await expect(preview.locator("circle")).toHaveCount(2);
  await expect(
    dialog.getByLabel("Ho verificato la scala su una misura reale"),
  ).toBeChecked();

  for (let i = 0; i < 13; i++)
    await dialog
      .getByRole("button", { name: "Aumenta zoom anteprima" })
      .click();
  await expect(dialog.getByLabel("Zoom anteprima", { exact: true })).toHaveText(
    "1600%",
  );
  await expect(
    dialog.getByRole("button", { name: "Aumenta zoom anteprima" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("File planimetria", { exact: true })
    .setInputFiles(file);
  await expect(dialog.getByLabel("Zoom anteprima", { exact: true })).toHaveText(
    "100%",
  );
  await expect(preview.locator("circle")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Riduci zoom anteprima" }),
  ).toBeDisabled();
});

test("lo zoom CAD conserva aggancio ai vertici e selezione durante il trascinamento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "punti.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(
      [
        0,
        "SECTION",
        2,
        "ENTITIES",
        0,
        "LINE",
        8,
        "MURI",
        10,
        0,
        20,
        0,
        11,
        10,
        21,
        10,
        0,
        "LINE",
        8,
        "MURI",
        10,
        4.95,
        20,
        5,
        11,
        5.05,
        21,
        5,
        0,
        "ENDSEC",
        0,
        "EOF",
        "",
      ].join("\n"),
    ),
  });
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  await expect(preview.locator("line")).toHaveCount(2);
  for (let i = 0; i < 13; i++)
    await dialog
      .getByRole("button", { name: "Aumenta zoom anteprima" })
      .click();
  const endpoint = await preview
    .locator("line")
    .nth(1)
    .evaluate((line) => ({
      x: Number(line.getAttribute("x2")),
      y: Number(line.getAttribute("y2")),
    }));
  const target = await screenPoint(preview, endpoint.x, endpoint.y);
  await page.mouse.click(target.x + 2, target.y);
  await expect(preview.locator("circle")).toHaveAttribute(
    "cx",
    String(endpoint.x),
  );
  await expect(preview.locator("circle")).toHaveAttribute(
    "cy",
    String(endpoint.y),
  );
  await dialog.getByLabel("MURI (2)", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Escludi / includi tracciati" })
    .click();
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + 50, target.y + 20, { steps: 8 });
  await page.mouse.up();
  await expect(
    dialog.getByText("2 segmenti selezionati.", { exact: false }),
  ).toBeVisible();
  await expect(preview.locator("circle")).toHaveCount(1);
  const movedTarget = await screenPoint(preview, 5, endpoint.y);
  await page.mouse.click(movedTarget.x, movedTarget.y);
  await expect(
    dialog.getByText("1 segmenti selezionati.", { exact: false }),
  ).toBeVisible();
});
