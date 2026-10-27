import { expect, test } from "./browser-test";
import type { Page } from "@playwright/test";
import { openAppearance, openInspector, openDisclosure } from "./ui-helpers";
import { readFileSync } from "node:fs";
import { PerspectiveCamera, Vector3 } from "three";
import { projectSchema } from "../src/schemas/project";
import { execFileSync } from "node:child_process";
import { radiatorVariantSchema } from "../src/domain/catalogs/radiator-schema";
import { radiatorDetail } from "../src/configurator/viewer3d/device-detail";

function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[console] ${message.text()}`);
  });
  return errors;
}

async function openMeasuredHouse(
  page: Page,
  file = "tests/fixtures/realistic-home.hvacproj",
) {
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles(file);
  await expect(page.locator(".nome-stanza")).toHaveCount(4);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(2);
  await expect(page.getByTestId("terminal-supply")).toHaveCount(2);
  await expect(page.getByTestId("terminal-return")).toHaveCount(1);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  return canvas;
}

test("measured shared-wall house: realistic scene, materials, camera and cutaway", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const errors = watchBrowserErrors(page);
  const canvas = await openMeasuredHouse(page);
  await expect(canvas).toHaveAttribute("data-scene", "realistic");
  await openAppearance(page);
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page.getByRole("button", { name: "Adatta vista", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("house-oak-cutaway.png"),
    fullPage: true,
  });
  await openAppearance(page);
  await page.getByLabel("Muri in sezione", { exact: true }).uncheck();
  await page.screenshot({
    path: testInfo.outputPath("house-full-walls-openings.png"),
    fullPage: true,
  });
  await page.getByLabel("Muri in sezione", { exact: true }).check();
  await page
    .getByLabel("Finitura pavimento", { exact: true })
    .selectOption("stone");
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await openAppearance(page);
  await expect(
    page.getByLabel("Finitura pavimento", { exact: true }),
  ).toHaveValue("stone");
  await page.screenshot({
    path: testInfo.outputPath("house-stone-cutaway.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Finitura pavimento", { exact: true })
    .selectOption("oak");
  await page.getByLabel("Nomi ambienti", { exact: true }).uncheck();
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Vista dall'alto", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("house-top.png"),
    fullPage: true,
  });
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Vista prospettica", exact: true })
    .click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing actual WebGL surface");
  const before = await canvas.screenshot();
  const cameraBefore = await canvas.getAttribute("data-camera-position");
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.58, {
    steps: 12,
  });
  await page.mouse.up();
  const after = await canvas.screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);
  await expect(canvas).not.toHaveAttribute(
    "data-camera-position",
    cameraBefore!,
  );
  await page.screenshot({
    path: testInfo.outputPath("house-orbit.png"),
    fullPage: true,
  });
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page.getByRole("button", { name: "Adatta vista", exact: true }).click();
  await openAppearance(page);
  await page.getByLabel("Nomi ambienti", { exact: true }).check();
  await page
    .getByRole("button", { name: "Seleziona Camera nel 3D", exact: true })
    .click();
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Avvicina selezione", exact: true })
    .click();
  await openAppearance(page);
  await page.getByLabel("Isola selezione", { exact: true }).check();
  await page.screenshot({
    path: testInfo.outputPath("camera-split-isolated.png"),
    fullPage: true,
  });
  await page.getByLabel("Isola selezione", { exact: true }).uncheck();
  expect(errors).toEqual([]);
});

test("radiator mesh selection and 2D selection stay synchronized in realistic 3D", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  const errors = watchBrowserErrors(page);
  const firstCanvas = await openMeasuredHouse(page);
  const fixture = projectSchema.parse(
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
      import {readFileSync} from 'node:fs';
      import {decodeProject} from './src/services/project/format.ts';
      console.log(JSON.stringify(decodeProject(readFileSync('tests/fixtures/realistic-home.hvacproj','utf8'))));
    `,
        ],
        { encoding: "utf8" },
      ),
    ),
  );
  const radiator = fixture.radiators[0];
  await page.getByRole("button", { name: /^Soggiorno 17,52/ }).click();
  await expect(firstCanvas).toHaveAttribute("data-selection", radiator.roomId);
  const originalCatalog = JSON.parse(
    readFileSync("catalog-data/generated/cordivari.json", "utf8"),
  );
  const variant = radiatorVariantSchema.parse(
    originalCatalog.products.find(
      (product: { id: string }) => product.id === radiator.productId,
    ),
  );
  const detail = radiatorDetail(radiator, variant);
  const tube = detail.tubes[Math.floor(radiator.elements / 2) * 3 + 2];
  const worldPoint = new Vector3(...tube.position)
    .applyAxisAngle(new Vector3(0, 1, 0), -radiator.rotation)
    .add(
      new Vector3(
        radiator.position.x,
        0.1 + radiator.heightMm / 2000,
        radiator.position.y,
      ),
    );
  const box = await firstCanvas.boundingBox();
  if (!box) throw new Error("Missing clickable WebGL surface");
  const camera = new PerspectiveCamera(
    Number(await firstCanvas.getAttribute("data-camera-fov")),
    box.width / box.height,
    0.02,
    2000,
  );
  camera.position.fromArray(
    (await firstCanvas.getAttribute("data-camera-position"))!
      .split(",")
      .map(Number),
  );
  camera.quaternion.fromArray(
    (await firstCanvas.getAttribute("data-camera-quaternion"))!
      .split(",")
      .map(Number),
  );
  camera.updateMatrixWorld();
  const projected = worldPoint.project(camera);
  await page.mouse.click(
    box.x + ((projected.x + 1) * box.width) / 2,
    box.y + ((1 - projected.y) * box.height) / 2,
  );
  await expect(firstCanvas).toHaveAttribute("data-selection", radiator.id);
  const configuration = page.getByRole("dialog", {
    name: "Configura apparecchio",
  });
  await expect(configuration).toBeVisible();
  await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
  await configuration
    .getByRole("button", { name: "Annulla", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page.getByTestId("radiator-2d").first().click();
  await expect(configuration).toBeVisible();
  await configuration
    .getByRole("button", { name: "Annulla", exact: true })
    .first()
    .click();
  await openInspector(page, "Posizione");
  await expect(page.getByText("Distanza centro dall'inizio (m)")).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await expect(canvas).toHaveAttribute("data-selection", radiator.id);
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Avvicina selezione", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("cordivari-selected-detail.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await openInspector(page, "Posizione");
  await expect(page.getByText("Distanza centro dall'inizio (m)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("realistic 3D fullscreen and smartphone resize keep usable canvas", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = watchBrowserErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = await openMeasuredHouse(page);
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Schermo intero", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("house-fullscreen.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Esci da schermo intero", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(250);
  expect(box?.height).toBeGreaterThan(220);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page
    .getByRole("button", { name: "Vista dall'alto", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("house-phone-top.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("view menu fits desktop and phone widths and the air flows only while the system is on", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const canvas = await openMeasuredHouse(page);
  const viewer = page.getByTestId("viewer-3d");
  await expect(canvas).not.toHaveAttribute("data-comfort-mode");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await openDisclosure(viewer, "Vista 3D");
    const panel = viewer.locator("details[open] > div").first();
    await expect(panel).toBeVisible();
    const bounds = await panel.boundingBox();
    const viewerBounds = await viewer.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(viewerBounds!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      viewerBounds!.x + viewerBounds!.width,
    );
    expect(
      await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`view-menu-${width}.png`),
      fullPage: true,
    });
  }
  await expect(
    viewer.getByRole("button", { name: "Presentazione cliente" }),
  ).toHaveCount(0);
  await expect(
    viewer.getByRole("button", { name: "Tour del progetto" }),
  ).toHaveCount(0);
  await viewer.getByRole("button", { name: "Impianto spento" }).click();
  await expect(canvas).toHaveAttribute("data-comfort-mode", "cool");
  await viewer.getByRole("button", { name: "Impianto acceso" }).click();
  await expect(canvas).not.toHaveAttribute("data-comfort-mode");
});

test("real Ecoclima grilles and circular valve keep their catalogue face forms", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const errors = watchBrowserErrors(page);
  for (const code of ["eblf", "evvmc", "egs"]) {
    await openMeasuredHouse(page, `tests/fixtures/realistic-${code}.hvacproj`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      code.toUpperCase(),
    );
    const room = page.getByRole("button", { name: /^Cucina 17,52/ });
    await room.click();
    await expect(room).toHaveAttribute("aria-pressed", "true");
    await openAppearance(page);
    await page.getByLabel("Isola selezione", { exact: true }).check();
    await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
    await page
      .getByRole("button", { name: "Avvicina selezione", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath(`terminal-${code}-detail.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("measured window creation, sill edit, save/reload and removal update real 3D", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const errors = watchBrowserErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^Disegna manualmente/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page.getByTestId("wall").first().click();
  await page.getByText("Porte e finestre", { exact: true }).click();
  await page
    .getByLabel("Tipo apertura", { exact: true })
    .selectOption("window");
  await page.getByLabel("Distanza apertura", { exact: true }).fill("0.8");
  await page.getByLabel("Larghezza apertura", { exact: true }).fill("1.3");
  await page.getByLabel("Altezza apertura", { exact: true }).fill("1.15");
  await page.getByLabel("Quota davanzale", { exact: true }).fill("0.92");
  await page
    .getByRole("button", { name: "Aggiungi apertura", exact: true })
    .click();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
  await expect(page.locator(".apertura-parete")).toContainText("1,30 × 1,15 m");
  await page
    .getByRole("button", { name: "Modifica apertura", exact: true })
    .click();
  await page.getByLabel("Larghezza apertura", { exact: true }).fill("1.45");
  await page.getByLabel("Quota davanzale", { exact: true }).fill("0.98");
  await page
    .getByRole("button", { name: "Salva apertura", exact: true })
    .click();
  await expect(page.locator(".apertura-parete")).toContainText(
    "davanzale 0,98 m",
  );
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
  await page.getByTestId("wall").first().click();
  await page.getByText("Porte e finestre", { exact: true }).click();
  await expect(page.locator(".apertura-parete")).toContainText("1,45 × 1,15 m");
  await expect(page.locator(".apertura-parete")).toContainText(
    "davanzale 0,98 m",
  );
  const downloadPromise = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Missing exported measured project");
  const exported = projectSchema.parse(
    JSON.parse(readFileSync(downloadPath, "utf8")),
  );
  expect(exported.openings).toHaveLength(1);
  expect(exported.openings[0]).toMatchObject({
    type: "window",
    offsetM: 0.8,
    widthM: 1.45,
    heightM: 1.15,
    sillHeightM: 0.98,
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await openAppearance(page);
  await page.getByLabel("Muri in sezione", { exact: true }).uncheck();
  await page.screenshot({
    path: testInfo.outputPath("measured-window-sill.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await page
    .getByRole("button", { name: "Rimuovi apertura", exact: true })
    .click();
  await expect(page.getByTestId("opening-2d")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("opening-2d")).toHaveCount(0);
  expect(errors).toEqual([]);
});
