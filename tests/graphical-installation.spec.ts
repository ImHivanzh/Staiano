import { pickTerminalLength, terminalLengthButton } from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { dragPlanDevice, openDisclosure } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

async function planPoint(scope: Locator, x: number, y: number, touch = false) {
  const canvas = scope.getByTestId("editor-2d");
  await canvas.scrollIntoViewIfNeeded();
  const screen = await canvas.evaluate(
    (node, point) => {
      const at = new DOMPoint(point.x, point.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      const rect = node.getBoundingClientRect();
      return { x: at.x - rect.left, y: at.y - rect.top };
    },
    { x, y },
  );
  if (touch) await canvas.tap({ position: screen });
  else await canvas.click({ position: screen });
}
const original = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
).empty;
async function load(page: Page, fixture = original) {
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "graphic.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
}
async function launch(page: Page) {
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();
  return plan;
}
async function exportSaved(page: Page) {
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

test.describe("tablet touch", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });
  test("places, configures and manually connects a terminal using touch", async ({
    page,
  }) => {
    await load(page);
    const graphic = await launch(page);
    await graphic.getByRole("button", { name: "Macchina", exact: true }).tap();
    await planPoint(graphic, 2, 4, true);
    await graphic.getByRole("button", { name: "Bocchetta", exact: true }).tap();
    await planPoint(graphic, 4, 2, true);
    await graphic.getByTestId("draft-terminal").tap();
    const picker = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
    });
    await picker
      .getByRole("button", { name: "Scegli EDLS", exact: true })
      .tap();
    await pickTerminalLength(picker, 1000);
    await picker
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
      .tap();
    await picker.screenshot({ path: ".cache/color-buttons-tablet.png" });
    await picker
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .tap();
    await graphic.getByRole("button", { name: "Collega", exact: true }).tap();
    await graphic.getByTestId("terminal-supply").tap();
    await graphic.getByRole("button", { name: /^Macchina UI/ }).tap();
    await expect(graphic.getByTestId("air-connection")).toHaveCount(1);

    const origin = await graphic
      .getByTestId("air-connection")
      .locator("polyline")
      .evaluate((line) => {
        const [x, y] = line
          .getAttribute("points")!
          .split(" ")[0]
          .split(",")
          .map(Number);
        const unit = line
          .closest("svg")!
          .querySelector('[data-testid="split-2d"]') as SVGGElement;
        const local = new DOMPoint(x, y).matrixTransform(
          unit.transform.baseVal.consolidate()!.matrix.inverse(),
        );
        const rect = unit.querySelector("rect")!;
        const halfWidth = Number(rect.getAttribute("width")) / 2;
        const halfDepth = Number(rect.getAttribute("height")) / 2;
        return {
          x: local.x,
          y: local.y,
          halfWidth,
          halfDepth,
          edgeDistance: Math.min(
            Math.abs(Math.abs(local.x) - halfWidth),
            Math.abs(Math.abs(local.y) - halfDepth),
          ),
        };
      });
    expect(origin.edgeDistance).toBeLessThan(1e-7);
    expect(Math.abs(origin.x)).toBeLessThanOrEqual(origin.halfWidth + 1e-7);
    expect(Math.abs(origin.y)).toBeLessThanOrEqual(origin.halfDepth + 1e-7);
  });
});

for (const width of [1920, 1024]) {
  test(`ducted modules: edit, move, delete machine, undo and persist at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await load(page);
    const graphic = await launch(page);
    await graphic
      .getByRole("button", { name: "Macchina", exact: true })
      .click();
    await planPoint(graphic, 2, 4);
    await graphic
      .getByRole("button", { name: "Bocchetta", exact: true })
      .click();
    await planPoint(graphic, 4, 2);
    await graphic.getByRole("button", { name: "Collega", exact: true }).click();
    await graphic.getByTestId("draft-terminal").click();
    await graphic.getByRole("button", { name: /^Macchina UI/ }).click();
    await page.keyboard.press("Escape");
    await graphic.getByTestId("draft-terminal").click();
    const picker = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
    });
    await picker
      .getByRole("button", { name: "Scegli EDFL-20", exact: true })
      .click();
    await pickTerminalLength(picker, 2000);
    await picker
      .getByRole("button", { name: "Aggiungi modulo nello stesso punto" })
      .click();
    await pickTerminalLength(picker, 1000, 2);
    await expect(
      picker.getByRole("button", { name: "Seleziona modulo 2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await picker
      .getByRole("button", { name: "Seleziona modulo 1", exact: true })
      .click();
    await expect(terminalLengthButton(picker, 2000)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await picker
      .getByRole("button", { name: "Aggiungi modulo nello stesso punto" })
      .click();
    await expect(
      picker.getByRole("button", { name: "Seleziona modulo 3", exact: true }),
    ).toContainText("Scegli misura");
    await picker
      .getByRole("button", { name: "Rimuovi modulo 3", exact: true })
      .click();
    await expect(
      picker.getByRole("button", { name: "Seleziona modulo 3", exact: true }),
    ).toHaveCount(0);
    await expect(
      picker.getByRole("button", { name: "Seleziona modulo 2", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await picker
      .locator('[aria-label="Composizione della bocchetta"]')
      .scrollIntoViewIfNeeded();
    await picker.screenshot({
      path: `.cache/terminal-graphic-modules-${width}.png`,
    });
    await picker
      .getByRole("button", {
        name: "Alluminio anodizzato naturale · colore non specificato",
        exact: true,
      })
      .click();
    await picker
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(graphic.getByTestId("terminal-supply")).toHaveCount(2);
    await graphic.getByRole("button", { name: "Collega", exact: true }).click();
    const machine = graphic.getByRole("button", { name: /^Macchina UI/ });
    await machine.click();
    const technical = graphic.locator("details").filter({
      has: page.getByText(
        "Dettagli tecnici della macchina selezionata · plenum e canali",
        { exact: true },
      ),
    });
    await technical.locator("summary").first().click();
    const technicalBox = await technical.boundingBox();
    const canvasBox = await graphic.getByTestId("editor-2d").boundingBox();
    expect(technicalBox!.width).toBeGreaterThan(canvasBox!.width * 0.9);
    expect(technicalBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 1);
    await page.screenshot({ path: `.cache/collega-layout-${width}.png` });
    await technical.locator("summary").first().click();
    await graphic.getByTestId("terminal-supply").first().click();
    await expect(graphic.getByTestId("air-connection")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await graphic.getByTestId("terminal-supply").first().click();
    const edit = page.getByRole("dialog", {
      name: "Configura bocchetta",
      exact: true,
    });
    await edit
      .getByRole("button", { name: "Seleziona modulo 2", exact: true })
      .click();
    await expect(terminalLengthButton(edit, 1000, 2)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await edit
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await graphic.locator('summary[aria-label="Azioni bocchetta"]').click();
    await graphic
      .getByRole("button", { name: "Muovi (M)", exact: true })
      .click();
    await dragPlanDevice(
      page,
      graphic,
      graphic.getByTestId("terminal-supply").first(),
      5,
      2,
    );
    await machine.click();
    await page
      .getByRole("dialog", { name: "Scegli macchina canalizzata" })
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await graphic.getByRole("button", { name: "Elimina" }).click();
    await expect(machine).toHaveCount(0);
    await expect(graphic.getByTestId("terminal-supply")).toHaveCount(2);
    await expect(graphic.getByTestId("air-connection")).toHaveCount(0);
    await graphic.locator('summary[aria-label="Altre azioni"]').click();
    await graphic
      .getByRole("button", { name: "Annulla ultima modifica" })
      .click();
    await expect(machine).toHaveCount(1);
    await expect(graphic.getByTestId("air-connection")).toHaveCount(1);
    const saved = await exportSaved(page);
    expect(saved.airTerminals.map((item) => item.widthMm)).toEqual([
      2000, 1000,
    ]);
    const centerX = saved.airTerminals.reduce(
      (sum, item) => sum + (item.position.x * item.widthMm) / 3000,
      0,
    );
    expect(centerX).toBeCloseTo(5, 1);
    await page.reload();
    await expect(graphic.getByTestId("air-connection")).toHaveCount(1);
  });
  for (const [type, label, deviceTestId] of [
    ["radiator", "radiatore", "radiator-2d"],
    ["fanCoil", "ventilconvettore", "fan-coil-2d"],
    ["split", "unità interna", "split-2d"],
  ]) {
    test(`independent ${type}: choose, click, move and persist at ${width}`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({
        width,
        height: width === 1920 ? 1080 : 768,
      });
      const fixture = structuredClone(original);
      fixture.hvacSystems = [];
      fixture.installations = [];
      fixture.airTerminals = [];
      fixture.plenums = [];
      fixture.ducts = [];
      fixture.rooms.forEach(
        (room: { systemType: string }) => (room.systemType = "none"),
      );
      await load(page, fixture);
      await page.locator(".stanza-pianta").first().click();
      await openDisclosure(page.locator(".proprieta"), "Configura impianto");
      await page
        .locator(".proprieta")
        .getByRole("button", { name: "Configura impianto", exact: true })
        .click();
      const settings = page.getByRole("dialog", {
        name: "Configura impianto",
        exact: true,
      });
      await settings
        .getByRole("button", { name: "Nuovo impianto", exact: true })
        .click();
      const fresh = page.getByRole("dialog", {
        name: "Nuovo impianto",
        exact: true,
      });
      await fresh.getByLabel("Tipo del nuovo impianto").selectOption(type);
      await fresh
        .getByRole("button", { name: "Crea impianto e apri vista" })
        .click();
      const view = page.getByRole("dialog", {
        name: "Vista Impianto 1",
        exact: true,
      });
      await expect(view.getByTestId("editor-2d")).toHaveCount(0);
      await view
        .getByRole("button", { name: "Apri planimetria operativa" })
        .click();
      const graphic = page.getByRole("region", {
        name: "Configurazione grafica apparecchi",
      });
      await graphic
        .getByRole("button", { name: `Nuovo punto ${label}`, exact: true })
        .click();
      await planPoint(graphic, 3, 0.2);
      const picker = page.getByRole("dialog", {
        name: `Scegli ${label} sul punto`,
        exact: true,
      });
      if (type === "radiator") {
        await picker.getByLabel("Marca radiatori").selectOption("Global");
        await picker.getByLabel("Famiglia radiatori").selectOption("VIP");
        await picker
          .getByLabel("Potenza da coprire con questo punto (W)")
          .fill("1800");
        await picker
          .getByRole("button", { name: "Trova radiatori compatibili" })
          .click();
        await picker
          .locator(".soluzione-radiatore")
          .first()
          .getByRole("button", { name: "Applica e posiziona" })
          .click();
      } else if (type === "fanCoil")
        await picker
          .getByRole("button", { name: "Aggiungi ventilconvettore" })
          .click();
      else
        await picker
          .getByRole("button", { name: "Configura climatizzazione" })
          .click();
      await expect(picker).toHaveCount(0);
      const device = graphic.getByTestId(deviceTestId);
      await expect(device).toHaveCount(1);
      await device.click();
      const edit = page.getByRole("dialog", {
        name: `Modifica ${label}`,
        exact: true,
      });
      await expect(edit).toBeVisible();
      await edit
        .getByRole("button", { name: "Torna alla planimetria" })
        .click();
      await graphic
        .getByRole("button", { name: "Sposta apparecchio", exact: true })
        .click();
      await planPoint(graphic, 5, 0.2);
      if (type === "fanCoil") {
        await graphic
          .getByRole("button", { name: "Posiziona pompa di calore" })
          .click();
        await planPoint(graphic, -1, 2);
        const pump = page.getByRole("dialog", {
          name: "Scegli pompa di calore sul punto",
          exact: true,
        });
        await pump.getByLabel("Marca pompa di calore").selectOption("Gree");
        await pump
          .getByLabel("Serie e modello pompa")
          .selectOption("gree-versati-v-8-monofase");
        await pump
          .getByRole("group", { name: "Ventilconvettori collegati" })
          .getByRole("checkbox")
          .first()
          .check();
        await pump
          .getByRole("button", { name: "Aggiungi pompa all’esterno" })
          .click();
        await expect(graphic.getByTestId("heat-pump-2d")).toHaveCount(1);
        await graphic.getByTestId("heat-pump-2d").locator("rect").click();
        await page
          .getByRole("dialog", {
            name: "Modifica pompa di calore",
            exact: true,
          })
          .getByRole("button", { name: "Torna alla planimetria" })
          .click();
        await graphic
          .getByRole("button", { name: "Sposta apparecchio" })
          .click();
        await planPoint(graphic, -1, 4);
      }
      await graphic.screenshot({
        path: info.outputPath(`independent-${type}.png`),
      });
      await page
        .getByRole("button", { name: "Torna all’editor", exact: true })
        .click();
      await expect(page.getByTestId("save-status")).toHaveText("Salvato");
      await page.reload();
      await page.getByRole("button", { name: "Lavora sull’impianto" }).click();
      await expect(device).toHaveCount(1);
      await expect(page.getByTestId("editor-2d")).toHaveCount(1);
      if (type === "radiator" && width === 1920) {
        await page
          .getByRole("button", { name: "Torna all’editor", exact: true })
          .click();
        await page.getByRole("button", { name: "3D", exact: true }).click();
        const viewer = page.getByTestId("viewer-3d");
        await openDisclosure(viewer, "Aggiungi apparecchio");
        await viewer
          .getByRole("button", { name: "Radiatori", exact: true })
          .click();
        const catalog = page.getByRole("dialog", {
          name: "Catalogo radiatori",
          exact: true,
        });
        await catalog
          .getByLabel("Ambiente destinazione")
          .selectOption(fixture.rooms[0].id);
        await catalog
          .getByRole("button", { name: "Apri vista Impianto 1", exact: true })
          .click();
        await view
          .getByRole("button", { name: "Apri planimetria operativa" })
          .click();
        await expect(graphic).toBeVisible();
        page.once("dialog", (dialog) => dialog.accept());
        await page
          .getByRole("button", { name: "Elimina impianto", exact: true })
          .click();
        await expect(catalog).toHaveCount(0);
        const afterDelete = await exportSaved(page);
        expect(afterDelete.installations).toHaveLength(0);
        expect(afterDelete.radiators).toHaveLength(0);
      }
    });
  }
}
