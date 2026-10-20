import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PerspectiveCamera, Vector3 } from "three";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import type { Project } from "../src/schemas/project";

const fixture = (source: string): Project =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", source],
      { encoding: "utf8" },
    ),
  );

for (const device of [
  { name: "PC", width: 1920, height: 1080, touch: false },
  { name: "iPad", width: 1024, height: 768, touch: true },
])
  test(`outdoor pump selects, exposes movement handles and saves a real 3D drag on ${device.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    const project = fixture(`
    import { createProject, addRectangle } from './src/domain/project.ts';
    import { applyHydronicSystem } from './src/domain/hydronic/apply.ts';
    import { heatPumpCatalog } from './src/domain/catalogs/heat-pumps.ts';
    const empty = createProject();
    const p = addRectangle(empty, empty.floors[0].id, { width: 8, length: 6, height: 2.7, name: 'Casa' });
    console.log(JSON.stringify(applyHydronicSystem(p, { productId: heatPumpCatalog.products[0].id, roomIds: [p.rooms[0].id], fanCoilIds: [], operatingPointIndex: 0 })));
  `);
    const pump = project.hydronicSystems![0].outdoorUnit;
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "pump.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await openDisclosure(page, "Modifica");
    await page
      .getByLabel("Elemento nel progetto", { exact: true })
      .selectOption(pump.id);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d"),
      canvas = viewer.locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true");
    await expect(page.locator("#proprieta-progetto")).toBeVisible();
    await expect(page.locator("#proprieta-progetto")).toContainText(
      "Apparecchio selezionato",
    );
    await expect(
      viewer.getByRole("button", { name: "Sposta 3D", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await viewer
      .getByRole("button", { name: "Vista ventilatore", exact: true })
      .click();
    await page.waitForTimeout(400);
    const box = (await canvas.boundingBox())!;
    const camera = new PerspectiveCamera(
      Number(await canvas.getAttribute("data-camera-fov")),
      box.width / box.height,
      0.02,
      2000,
    );
    camera.position.fromArray(
      (await canvas.getAttribute("data-camera-position"))!
        .split(",")
        .map(Number),
    );
    camera.quaternion.fromArray(
      (await canvas.getAttribute("data-camera-quaternion"))!
        .split(",")
        .map(Number),
    );
    camera.updateMatrixWorld();
    const center = new Vector3(
      pump.position.x,
      pump.elevationM,
      pump.position.y,
    );
    const factor =
      (center.distanceTo(camera.position) *
        Math.min(1.9 * Math.tan((Math.PI * camera.fov) / 360), 7) *
        1.2) /
      7;
    const axisSign = Math.sign(camera.position.x - center.x);
    const screen = (point: Vector3) => {
      const p = point.project(camera);
      return {
        x: box.x + ((p.x + 1) * box.width) / 2,
        y: box.y + ((1 - p.y) * box.height) / 2,
      };
    };
    const start = screen(
      center.clone().add(new Vector3(axisSign * factor * 0.75, 0, 0)),
    );
    const end = screen(
      center.clone().add(new Vector3(axisSign * factor * 0.75 + 0.5, 0, 0)),
    );
    await page.screenshot({
      path: info.outputPath("pump-before-drag.png"),
      fullPage: true,
    });
    if (device.touch) {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start.x, y: start.y, id: 1 }],
      });
      for (let step = 1; step <= 12; step++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: start.x + ((end.x - start.x) * step) / 12,
              y: start.y + ((end.y - start.y) * step) / 12,
              id: 1,
            },
          ],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 12 });
      await page.mouse.up();
    }
    await expect(canvas).toHaveAttribute("data-selection", pump.id);
    await expect(viewer.locator("output")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("pump-drag.png"),
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const changed = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(changed.hydronicSystems[0].outdoorUnit.position.x).toBeGreaterThan(
      pump.position.x + 0.2,
    );
    expect(changed.hydronicSystems[0].outdoorUnit.position.y).toBeCloseTo(
      pump.position.y,
      2,
    );
    expect(changed.hydronicSystems[0].outdoorUnit.rotation).toBeCloseTo(
      Math.PI,
    );
    await page
      .getByRole("button", { name: "Inverti verso (180°)", exact: true })
      .click();
    await expect(page.locator('.proprieta input[name="rotation"]')).toHaveValue(
      "360",
    );
    await page
      .getByRole("button", {
        name: "Rivolgi ventilatore all’esterno",
        exact: true,
      })
      .click();
    await expect(page.locator('.proprieta input[name="rotation"]')).toHaveValue(
      "180",
    );
  });

test("channel setup stays closed until requested and opens in the configuration popup", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "channels.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify(
        fixture(
          `import { pdfQaFixture } from './scripts/verification/pdf-fixture.ts'; console.log(JSON.stringify(pdfQaFixture()));`,
        ),
      ),
    ),
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  const panel = page.getByRole("dialog", { name: "Canalizzazione collegata" });
  await expect(panel).toHaveCount(0);
  await openDisclosure(viewer, "Vista 3D");
  await viewer
    .getByRole("button", { name: "Vista Canale", exact: true })
    .click();
  await viewer
    .getByRole("button", { name: "Configura percorsi", exact: true })
    .click();
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1920);
  expect(box.height).toBeLessThanOrEqual(1080);
  await panel.locator("details > summary").first().click();
  await expect(
    panel
      .getByRole("button", { name: "Genera / aggiorna percorsi proposti" })
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("channels-popup-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  const tablet = (await panel.boundingBox())!;
  expect(tablet.x).toBeGreaterThanOrEqual(0);
  expect(tablet.y).toBeGreaterThanOrEqual(0);
  expect(tablet.x + tablet.width).toBeLessThanOrEqual(1024);
  expect(tablet.y + tablet.height).toBeLessThanOrEqual(768);
  await page.screenshot({
    path: info.outputPath("channels-popup-ipad.png"),
    fullPage: true,
  });
  await panel
    .getByRole("button", { name: "Chiudi canali", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
});

test("raising the outdoor unit preserves the operator camera", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const project = fixture(`
    import { createProject, addRectangle } from './src/domain/project.ts';
    import { applyHydronicSystem } from './src/domain/hydronic/apply.ts';
    import { heatPumpCatalog } from './src/domain/catalogs/heat-pumps.ts';
    let p=createProject(); p=addRectangle(p,p.floors[0].id,{width:8,length:6,height:2.7,name:'Casa'});
    console.log(JSON.stringify(applyHydronicSystem(p,{productId:heatPumpCatalog.products[0].id,roomIds:[p.rooms[0].id],fanCoilIds:[],operatingPointIndex:0})));
  `);
  const unit = project.hydronicSystems![0].outdoorUnit;
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "staffe.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(unit.id);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d"),
    canvas = viewer.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await viewer
    .getByRole("button", { name: "Vista ventilatore", exact: true })
    .click();
  await page.waitForTimeout(400);
  const position = await canvas.getAttribute("data-camera-position");
  const rotation = await canvas.getAttribute("data-camera-quaternion");
  const box = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(
    Number(await canvas.getAttribute("data-camera-fov")),
    box.width / box.height,
    0.02,
    2000,
  );
  camera.position.fromArray(position!.split(",").map(Number));
  camera.quaternion.fromArray(rotation!.split(",").map(Number));
  camera.updateMatrixWorld();
  const center = new Vector3(unit.position.x, unit.elevationM, unit.position.y);
  const factor =
    (center.distanceTo(camera.position) *
      Math.min(1.9 * Math.tan((Math.PI * camera.fov) / 360), 7) *
      1.2) /
    7;
  const screen = (v: Vector3) => {
    const p = v.project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  };
  const start = screen(center.clone().add(new Vector3(0, factor * 0.75, 0))),
    end = screen(center.clone().add(new Vector3(0, factor * 0.75 + 0.6, 0)));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const moved = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(moved.hydronicSystems[0].outdoorUnit.elevationM).toBeGreaterThan(
    unit.elevationM + 0.2,
  );
  await expect(canvas).toHaveAttribute("data-camera-position", position!);
  await expect(canvas).toHaveAttribute("data-camera-quaternion", rotation!);
});
