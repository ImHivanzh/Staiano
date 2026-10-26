import { heatPumpProductAtVersion } from "../src/domain/catalogs/heat-pumps";
import { exportPlenumFixture } from "./plenum-ui-fixture";
import { readFileSync, writeFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import type { Project } from "../src/schemas/project";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

const fixture = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
).empty as Project;

test("raster analysis creates real walls and a room, saves its original and opens persistent guidance", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "empty.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...fixture,
        walls: [],
        rooms: [],
        airTerminals: [],
        plenums: [],
        hvacSystems: [],
        floors: fixture.floors.map((f) => ({
          ...f,
          configurationWizard: null,
        })),
      }),
    ),
  });
  await expect(
    page.getByRole("heading", { name: fixture.name, exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("wall")).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 400, 300);
    context.strokeStyle = "black";
    context.lineWidth = 8;
    context.strokeRect(40, 40, 280, 200);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await openDisclosure(page, "Modifica");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "test-orthogonal.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  });
  await expect(dialog).toContainText("4 proposte principali");
  await dialog
    .getByRole("combobox", { name: "Unità geometria" })
    .selectOption("0.01");
  await dialog.getByLabel("Ho verificato la scala su una misura reale").check();
  const importWalls = dialog.getByRole("button", {
    name: /^Importa muri selezionati/,
  });
  await expect(importWalls).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Seleziona proposte visibili" })
    .click();
  await dialog
    .getByLabel(/Le geometrie selezionate rappresentano assi muro/)
    .check();
  await expect(importWalls).toBeEnabled();
  await importWalls.click();
  await expect(dialog).toHaveCount(0);
  const imported = await exportPlenumFixture(page);
  const rasterPath = info.outputPath("raster-project.json");
  writeFileSync(rasterPath, JSON.stringify(imported, null, 2));
  await info.attach("raster-project", {
    path: rasterPath,
    contentType: "application/json",
  });
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await expect(page.locator(".nome-stanza")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Configurazione guidata" }),
  ).toContainText("Passo 1 di 5");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const downloaded = await download;
  const result = JSON.parse(
    readFileSync((await downloaded.path())!, "utf8"),
  ) as Project;
  expect(result.sourceFilesMetadata[0].originalDataUrl).toMatch(
    /^data:image\/png;base64,/,
  );
  expect(result.floors[0].importAnalysis?.wallsConfirmedByOperator).toBe(4);
  expect(result.floors[0].importAnalysis?.wallsAutoCreated).toBe(0);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(4);
});

test("Innova M7 and Gree outdoor heat pump are real editable objects with summary export", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "systems.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await openDisclosure(viewer, "Aggiungi apparecchio");
  await viewer
    .getByRole("button", { name: "Ventilconvettori", exact: true })
    .click();
  const insert = page.getByRole("complementary", {
    name: "Inserisci apparecchio",
  });
  await insert
    .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await pickPlanPoint(plan, 3, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const panel = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await panel.getByRole("button", { name: "Innova", exact: true }).click();
  await panel.getByRole("button", { name: "2 tubi", exact: true }).click();
  await panel
    .getByRole("group", { name: "Modello" })
    .getByRole("button", { name: /AirLeaf SLI/ })
    .click();
  const taglia = panel.getByRole("group", { name: "Taglia" });
  const firstSize = taglia.getByRole("button").first();
  const model = (await firstSize.getAttribute("data-product-id"))!;
  await firstSize.click();
  await panel
    .getByRole("combobox", { name: "Comando originale Innova M7", exact: true })
    .selectOption("innova-eeb749ii");
  await panel
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(1);
  const withFan = await exportPlenumFixture(page);
  expect(withFan.fanCoils![0]).toMatchObject({
    productId: model,
    controllerId: "innova-eeb749ii",
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await openDisclosure(viewer, "Aggiungi apparecchio");
  await viewer
    .getByRole("button", { name: "Pompa di calore", exact: true })
    .click();
  await insert
    .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
    .click();
  await plan.getByRole("button", { name: "Riduci zoom", exact: true }).click();
  await pickPlanPoint(plan, -1.2, 3);
  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("draft-heatPump").click();
  await plan.getByTestId("fan-coil-2d").click();
  await page.keyboard.press("Escape");
  await plan.getByTestId("draft-heatPump").click();
  const hydronic = page.getByRole("dialog", {
    name: "Scegli pompa di calore",
    exact: true,
  });
  await hydronic
    .getByRole("combobox", { name: "Marca pompa di calore", exact: true })
    .selectOption("Gree");
  await hydronic
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
  const connected = await exportPlenumFixture(page);
  expect(connected.hydronicSystems![0].fanCoilIds).toEqual([
    withFan.fanCoils![0].id,
  ]);
  expect(
    heatPumpProductAtVersion(
      connected.hydronicSystems![0].productId,
      connected.hydronicSystems![0].catalogVersion,
    )?.manufacturer,
  ).toBe("Gree");
  await plan.getByTestId("heat-pump-2d").locator("rect").first().click();
  await hydronic
    .getByRole("button", { name: "Dati impianto", exact: true })
    .click();
  await openDisclosure(hydronic, "Posizione e proprietà della macchina");
  const rotation = hydronic.locator('input[name="rotation"]');
  await rotation.fill("0");
  await hydronic
    .getByRole("button", { name: "Aggiorna posizione esterna", exact: true })
    .click();
  await expect(rotation).toHaveValue("0");
  await hydronic
    .getByRole("button", {
      name: "Rivolgi ventilatore all’esterno",
      exact: true,
    })
    .click();
  await hydronic
    .locator("footer")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  const saved = await exportPlenumFixture(page);
  const outdoor = saved.hydronicSystems![0].outdoorUnit,
    room = saved.rooms.find((item) => item.id === withFan.fanCoils![0].roomId)!;
  expect(
    -Math.sin(outdoor.rotation) * (outdoor.position.x - room.centroid.x) +
      Math.cos(outdoor.rotation) * (outdoor.position.y - room.centroid.y),
  ).toBeGreaterThan(0);
  await openDisclosure(page, "Modifica");
  const objects = page.getByLabel("Elemento nel progetto", { exact: true });
  await expect(
    objects.locator("option").filter({ hasText: "FC1" }),
  ).toHaveCount(1);
  await expect(
    objects.locator("option").filter({ hasText: "PDC1" }),
  ).toHaveCount(1);
  await objects.selectOption(withFan.fanCoils![0].id);
  await objects.press("Escape");
  await page.screenshot({
    path: info.outputPath("hydronic-outdoor-2d.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await openDisclosure(viewer, "Vista 3D");
  await viewer
    .getByRole("button", { name: "Vista Canale", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("hydronic-outdoor-3d.png"),
    fullPage: true,
  });
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica dossier sintetico PDF", exact: true })
    .click();
  const download = await waiting;
  expect(download.suggestedFilename()).toContain("sintetico");
  const pdfPath = info.outputPath("hydronic-summary.pdf");
  await download.saveAs(pdfPath);
  expect(readFileSync(pdfPath).subarray(0, 4).toString("ascii")).toBe("%PDF");
  await page.reload();
  await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
  const restored = await exportPlenumFixture(page);
  expect(restored.fanCoils).toEqual(saved.fanCoils);
  expect(restored.hydronicSystems).toEqual(saved.hydronicSystems);
});

test("front plenum view shows each actual port number and diameter", async ({
  page,
}, info) => {
  const network = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).network as Project;
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "front-plenum.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(network)),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(network.rooms.length);
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  const before = await exportPlenumFixture(page);
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  const viewer = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
    exact: true,
  });
  await openDisclosure(viewer, "Schema e dimensionamento plenum");
  await viewer
    .getByRole("button", { name: "Vista 3D plenum", exact: true })
    .click();
  await expect(
    viewer.getByRole("button", { name: "Vista frontale", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const preview = viewer.getByTestId("plenum-preview-3d");
  await expect(preview.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  const ports = Number(
    await preview.locator("canvas").getAttribute("data-plenum-ports"),
  );
  expect(ports).toBeGreaterThan(0);
  for (let i = 1; i <= ports; i++)
    await expect(
      preview.getByText(new RegExp(`^${i} · Ø \\d+$`)),
    ).toBeVisible();
  const overlappingLabels = await preview
    .locator("span")
    .filter({ hasText: /^\d+ · Ø \d+$/ })
    .evaluateAll((labels) => {
      const boxes = labels.map((label) => label.getBoundingClientRect());
      return boxes.some((a, i) =>
        boxes.some(
          (b, j) =>
            j > i &&
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
        ),
      );
    });
  expect(overlappingLabels).toBe(false);
  await viewer.getByRole("button", { name: "Espandi plenum / esci" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const canvas = element.querySelector("canvas")!;
        return Math.abs(parseFloat(canvas.style.width) - element.clientWidth);
      }),
    )
    .toBeLessThan(2);
  await expect
    .poll(() =>
      preview.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const labels = Array.from(element.querySelectorAll("span")).filter(
          (label) => /^\d+ · Ø \d+$/.test(label.textContent ?? ""),
        );
        const center =
          labels.reduce((sum, label) => {
            const box = label.getBoundingClientRect();
            return sum + (box.left + box.right) / 2;
          }, 0) / labels.length;
        return Math.abs(center - (bounds.left + bounds.right) / 2);
      }),
    )
    .toBeLessThan(5);
  await page.screenshot({
    path: info.outputPath("plenum-front-numbered-diameters.png"),
    fullPage: true,
  });
  await viewer.getByRole("button", { name: "Espandi plenum / esci" }).click();
  await viewer
    .locator("footer")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  const after = await exportPlenumFixture(page);
  expect(after.hvacSystems).toEqual(before.hvacSystems);
  expect(after.plenums).toEqual(before.plenums);
  expect(after.airTerminals).toEqual(before.airTerminals);
});
