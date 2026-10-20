import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import type { Project } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

const fixture = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
).empty as Project;

test("raster analysis creates real walls and a room, saves its original and opens persistent guidance", async ({
  page,
}) => {
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
  await expect(dialog).toContainText("4 muri candidati");
  await dialog
    .getByRole("combobox", { name: "Unità geometria" })
    .selectOption("0.01");
  await dialog.getByLabel("Ho verificato la scala su una misura reale").check();
  await dialog
    .getByRole("button", { name: "Importa muri selezionati" })
    .click();
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
  expect(result.floors[0].importAnalysis?.wallsAutoCreated).toBe(4);
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
    { timeout: 30000 },
  );
  await viewer
    .getByRole("button", { name: "Seleziona Soggiorno nel 3D" })
    .click();
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await viewer
    .getByRole("button", { name: "Ventilconvettori", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Ventilconvettori e comandi",
  });
  const select = panel.getByRole("combobox", {
    name: "Serie e modello",
    exact: true,
  });
  const model = await select
    .locator("option")
    .filter({ hasText: "AirLeaf SLI" })
    .first()
    .getAttribute("value");
  await select.selectOption(model!);
  await panel
    .getByLabel("Comando originale Innova M7")
    .selectOption("innova-eeb749ii");
  await panel
    .getByRole("button", { name: "Aggiungi ventilconvettore" })
    .click();
  await page.getByRole("button", { name: "Chiudi impianto idronico" }).click();
  await openDisclosure(page, "Modifica");
  await expect(
    page
      .getByRole("combobox", { name: "Elemento nel progetto" })
      .locator("option")
      .filter({ hasText: "FC1" }),
  ).toHaveCount(1);
  await page.locator(".menu-modifica > summary").press("Escape");
  await expect(page.locator(".menu-modifica[open]")).toHaveCount(0);
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await viewer
    .getByRole("button", { name: "Pompa di calore", exact: true })
    .click();
  const hydronic = page.getByRole("dialog", {
    name: "Impianto idronico · macchina esterna",
  });
  await hydronic.getByLabel("Marca pompa di calore").selectOption("Gree");
  await hydronic.getByRole("checkbox").filter({ visible: true }).last().check();
  await hydronic
    .getByRole("button", { name: "Aggiungi pompa all’esterno" })
    .click();
  await hydronic
    .getByRole("button", { name: "Chiudi impianto idronico" })
    .click();
  await openDisclosure(page, "Modifica");
  await expect(
    page
      .getByRole("combobox", { name: "Elemento nel progetto" })
      .locator("option")
      .filter({ hasText: "PDC1" }),
  ).toHaveCount(1);
  await page.locator(".menu-modifica > summary").press("Escape");
  await expect(page.locator(".menu-modifica[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("heat-pump-2d")).toHaveCount(1);
  await expect(page.getByTestId("fan-coil-2d")).toHaveCount(1);
  await page.getByTestId("heat-pump-2d").click();
  const rotation = page.locator('.proprieta input[name="rotation"]');
  await rotation.fill("0");
  await page
    .getByRole("button", { name: "Aggiorna posizione esterna", exact: true })
    .click();
  await expect(rotation).toHaveValue("0");
  await page
    .getByRole("button", {
      name: "Rivolgi ventilatore all’esterno",
      exact: true,
    })
    .click();
  await expect(rotation).toHaveValue(/^-?180$/);
  await page.getByTestId("fan-coil-2d").click();
  await page.screenshot({
    path: info.outputPath("hydronic-outdoor-2d.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await viewer
    .getByRole("button", { name: "Vista Canale", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("hydronic-outdoor-3d.png"),
    fullPage: true,
  });
  await openDisclosure(page, "File");
  await page
    .getByRole("combobox", { name: "Tipo dossier" })
    .selectOption("summary");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dossier PDF", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("sintetico");
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
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await viewer.getByRole("button", { name: "Plenum", exact: true }).click();
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
});
