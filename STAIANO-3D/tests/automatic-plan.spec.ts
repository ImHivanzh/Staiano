import { readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("an imported image becomes an editable 2D plan with rooms and openings after scale confirmation", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const runtime = await page.request.get("/api/import/reconstruct");
  test.skip(
    !(await runtime.json()).available,
    "Installare il runtime locale Raster2Seq per questo collaudo.",
  );
  const pixels = gunzipSync(
    readFileSync("tests/fixtures/plan-recognition/unite-barn.rgba.gz"),
  ).toString("base64");
  const png = await page.evaluate((pixels) => {
    const canvas = document.createElement("canvas");
    canvas.width = 541;
    canvas.height = 375;
    canvas.getContext("2d")!.putImageData(
      new ImageData(
        Uint8ClampedArray.from(atob(pixels), (c) => c.charCodeAt(0)),
        541,
        375,
      ),
      0,
      0,
    );
    return canvas.toDataURL("image/png").split(",")[1];
  }, pixels);
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).origin !== new URL(page.url()).origin
    )
      external.push(request.url());
  });
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "pianta-2d.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(dialog.getByText(/stanz[ae] ricostruit[ae]/)).toBeVisible({
    timeout: 120000,
  });
  const importButton = dialog.getByRole("button", {
    name: "Importa planimetria 2D",
    exact: true,
  });
  await expect(importButton).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("automatic-plan-desktop.png"),
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("automatic-plan-ipad.png") });
  await dialog.getByLabel("Unità geometria").selectOption("0.01");
  await dialog
    .getByRole("checkbox", {
      name: "Ho verificato la scala su una misura reale",
    })
    .check();
  await dialog
    .getByRole("button", { name: "Seleziona proposte visibili" })
    .click();
  await dialog
    .getByLabel(/Le geometrie selezionate rappresentano assi muro/)
    .check();
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("editor-2d")).toBeVisible();
  await expect(page.locator(".nome-stanza").first()).toBeVisible();
  await openDisclosure(page, "File");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const project = JSON.parse(
    readFileSync((await (await downloaded).path())!, "utf8"),
  );
  await writeFile(
    info.outputPath("imported-project.json"),
    JSON.stringify(project, null, 2),
  );
  expect(project.walls.length).toBeGreaterThan(3);
  expect(project.rooms.length).toBe(2);
  expect(project.openings.length).toBeGreaterThan(0);
  expect(project.walls.every((wall: { locked: boolean }) => !wall.locked)).toBe(
    true,
  );
  expect(
    project.rooms.every((room: { netAreaM2: number }) => room.netAreaM2 > 0),
  ).toBe(true);
  expect(project.floors[0].importAnalysis.roomsDetected).toBe(
    project.rooms.length,
  );
  expect(external).toEqual([]);
  await page.reload();
  await expect(page.locator(".nome-stanza")).toHaveCount(project.rooms.length);
  await page.screenshot({
    path: info.outputPath("automatic-plan-imported.png"),
  });
  await mkdir(".impeccable/review/automatic-plan", { recursive: true });
  for (const [source, destination] of [
    ["automatic-plan-desktop.png", "desktop.png"],
    ["automatic-plan-ipad.png", "ipad.png"],
    ["automatic-plan-imported.png", "imported.png"],
  ])
    await copyFile(
      info.outputPath(source),
      `.impeccable/review/automatic-plan/${destination}`,
    );
});

test("closing the importer cancels local reconstruction and removes its temporary image", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  const status = await page.request.get("/api/import/reconstruct");
  test.skip(
    !(await status.json()).available,
    "Installare il runtime locale Raster2Seq per questo collaudo.",
  );
  const pixels = gunzipSync(
    readFileSync("tests/fixtures/plan-recognition/unite-barn.rgba.gz"),
  ).toString("base64");
  const png = await page.evaluate((pixels) => {
    const canvas = document.createElement("canvas");
    canvas.width = 541;
    canvas.height = 375;
    canvas.getContext("2d")!.putImageData(
      new ImageData(
        Uint8ClampedArray.from(atob(pixels), (c) => c.charCodeAt(0)),
        541,
        375,
      ),
      0,
      0,
    );
    return canvas.toDataURL("image/png").split(",")[1];
  }, pixels);
  const before = new Set(
    await readdir(".cache/plan-recognition").catch(() => [] as string[]),
  );
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "annulla-pianta.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  let created: string[] = [];
  await expect
    .poll(
      async () => {
        created = (await readdir(".cache/plan-recognition")).filter(
          (name) => !before.has(name),
        );
        return created.length;
      },
      { timeout: 30000 },
    )
    .toBe(1);
  await dialog
    .getByRole("button", { name: "Chiudi importazione", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const remaining = await readdir(".cache/plan-recognition");
        return created.filter((name) => remaining.includes(name)).length;
      },
      { timeout: 15000 },
    )
    .toBe(0);
});
