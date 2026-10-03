import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

test("smartphone consultation and simple room edits remain usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Altezza stanza", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Applica proprietà" }).click();
  await expect(page.getByTestId("room-load")).toContainText("1,68");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("mobile-390.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cataloghi tecnici", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cataloghi tecnici locali" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("inclined manual wall uses exact comma-decimal length and preserves it after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("button", { name: "Chiudi stanza rettangolare" })
    .click();
  await page.getByRole("button", { name: "Disegna muro", exact: true }).click();
  const editor = page.getByTestId("editor-2d");
  const box = await editor.boundingBox();
  if (!box) throw new Error("Missing drawing surface");
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.35);
  await page
    .getByRole("textbox", { name: "Lunghezza esatta nuovo muro" })
    .fill("4,23");
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.62);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("wall")).toHaveCount(1);
  await expect(page.getByTestId("wall")).toContainText("4,23 m");
  const line = page.getByTestId("wall").locator("line").first();
  const coordinates = await line.evaluate((element) =>
    ["x1", "y1", "x2", "y2"].map((name) => Number(element.getAttribute(name))),
  );
  expect(
    Math.hypot(
      coordinates[2] - coordinates[0],
      coordinates[3] - coordinates[1],
    ),
  ).toBeCloseTo(4.23, 8);
  expect(Math.abs(coordinates[2] - coordinates[0])).toBeGreaterThan(0.1);
  expect(Math.abs(coordinates[3] - coordinates[1])).toBeGreaterThan(0.1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toContainText("4,23 m");
});

test("room copy, group drag, undo and contour deletion preserve project data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page.getByRole("button", { name: "Copia selezione" }).click();
  await expect(page.getByTestId("wall")).toHaveCount(8);
  await expect(page.locator(".nome-stanza")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: /Soggiorno — copia/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Soggiorno — copia/ }).click();
  const polygon = page.locator(".stanza-pianta.scelta");
  const pointsBefore = await polygon.getAttribute("points");
  const box = await polygon.boundingBox();
  if (!box) throw new Error("Copied room missing");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(polygon).not.toHaveAttribute("points", pointsBefore!);
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await page.getByRole("button", { name: /Soggiorno — copia/ }).click();
  await expect(polygon).toHaveAttribute("points", pointsBefore!);
  await page.getByTestId("wall").first().click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Elimina selezione" }).click();
  await expect(page.locator(".nome-stanza")).toHaveCount(2);
  await page.getByRole("button", { name: /^Soggiorno 15,96/ }).click();
  await expect(page.getByText(/Contorno da richiudere/)).toBeVisible();
});

test("200 walls, 50 rooms and 100 real devices load and orbit without page errors", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "large.hvacproj",
    mimeType: "application/json",
    buffer: readFileSync("tests/fixtures/large.hvacproj"),
  });
  await expect(page.getByTestId("wall")).toHaveCount(200);
  await expect(page.locator(".nome-stanza")).toHaveCount(50);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(100);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing WebGL canvas");
  const samplesPromise = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (times.length >= 30) resolve(times);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const started = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 130,
    box.y + box.height / 2 + 40,
    { steps: 15 },
  );
  await page.mouse.up();
  const orbitInteractionMs = Date.now() - started;
  const samples: number[] = await samplesPromise;
  const sorted = samples.toSorted((a, b) => a - b);
  const metrics = {
    walls: 200,
    rooms: 50,
    devices: 100,
    animationFrameMedianMs: sorted[15],
    animationFrameP95Ms: sorted[28],
    orbitInteractionMs,
  };
  await writeFile(
    testInfo.outputPath("browser-performance.json"),
    JSON.stringify(metrics, null, 2),
  );
  await testInfo.attach("browser-performance", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(metrics.animationFrameMedianMs).toBeLessThan(100);
  expect(metrics.orbitInteractionMs).toBeLessThan(5000);
  await canvas.screenshot({ path: testInfo.outputPath("large-3d.png") });
  expect(errors).toEqual([]);
});
