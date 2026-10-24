import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./browser-test";
import { chooseFanCoilModel, dragPlanDevice, openDisclosure } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

const legacy = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
).empty;
async function point(scope: Locator, x: number, y: number, hover = false) {
  const svg = scope.getByTestId("editor-2d");
  const screen = await svg.evaluate(
    (node, p) => {
      const at = new DOMPoint(p.x, p.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      const box = node.getBoundingClientRect();
      return { x: at.x - box.left, y: at.y - box.top };
    },
    { x, y },
  );
  if (hover) await svg.hover({ position: screen });
  else await svg.click({ position: screen });
}
async function load(page: Page, raw = legacy) {
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "plan.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  if (raw.floors[0].configurationWizard?.status === "active")
    await page
      .getByRole("button", { name: "Continua liberamente nell’editor" })
      .click();
  else
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      raw.name,
    );
}
async function launch(page: Page) {
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lavora sull’impianto" }),
  ).toHaveCount(0);
  return plan;
}
async function saved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await downloaded).path())!, "utf8")),
  );
}
test("previous project exposes the ducted tools on the main plan", async ({
  page,
}) => {
  await load(page);
  const plan = await launch(page);
  await expect(page.getByTestId("editor-2d")).toHaveCount(1);
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await point(plan, 2, 4);
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await point(plan, 4, 2);
  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("draft-terminal").click();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await page.keyboard.press("Escape");
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await expect(page.getByLabel("Portata massima macchina manuale")).toHaveValue(
    String(legacy.hvacSystems[0].genericMachine.maxAirflowM3h),
  );
});

test("SketchUp shortcuts activate matching plan tools and ignore open dialogs", async ({
  page,
}) => {
  await load(page);
  const plan = await launch(page);
  const drawing = plan.locator('summary[aria-label="Disegno e misure"]');
  for (const [key, label] of [
    ["t", "Misura"],
    ["h", "Sposta vista"],
    ["l", "Disegna muro"],
  ]) {
    await page.keyboard.press(key);
    await expect(drawing).toHaveAttribute(
      "title",
      `${label} attivo · Disegno e misure`,
    );
  }
  await page.keyboard.press("m");
  await expect(
    plan.getByRole("button", { name: "Muovi (M)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(
    plan.getByRole("button", { name: "Seleziona", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("r");
  const rectangle = page.getByRole("dialog", {
    name: "Crea stanza rettangolare",
  });
  await expect(rectangle).toBeVisible();
  await page.keyboard.press("t");
  await expect(drawing).toHaveAttribute("title", "Disegno e misure");
  await page
    .getByRole("button", { name: "Chiudi stanza rettangolare" })
    .click();
  await expect(rectangle).toHaveCount(0);
});

for (const width of [1920, 1024]) {
  test(`places and moves fan coils and heat pumps on the plan at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await load(page);
    const plan = await launch(page);
    await plan
      .getByRole("button", { name: "Ventilconvettore", exact: true })
      .click();
    await point(plan, 2, 0.4);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await plan.getByTestId("draft-fanCoil").click();
    const equipment = page.getByRole("dialog", {
      name: "Configura apparecchio",
      exact: true,
    });
    await chooseFanCoilModel(equipment, {
      manufacturer: "Aermec",
      model: "FCZ PO",
    });
    await equipment
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(equipment).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("m");
    await dragPlanDevice(page, plan, plan.getByTestId("fan-coil-2d"), 3, 0.4);
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    await plan
      .getByRole("button", { name: "Pompa di calore", exact: true })
      .click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await point(plan, 4, -0.6);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(plan.getByTestId("draft-heatPump")).toHaveCount(1);
    const pending = await saved(page);
    expect(pending.heatPumpDrafts).toHaveLength(1);
    expect(pending.hydronicSystems).toHaveLength(0);
    await page.reload();
    await expect(plan.getByTestId("draft-heatPump")).toHaveCount(1);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-heatPump").click();
    await plan.getByTestId("fan-coil-2d").click();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-heatPump").click();
    const pumpDialog = page.getByRole("dialog", {
      name: "Scegli pompa di calore",
      exact: true,
    });
    await expect(
      pumpDialog
        .locator("footer")
        .getByRole("button", { name: "Annulla", exact: true }),
    ).toBeVisible();
    await pumpDialog.getByLabel("Nome pompa di calore").fill("Pompa esterna");
    await pumpDialog
      .getByRole("group", { name: "Ventilconvettori collegati" })
      .getByRole("checkbox")
      .check();
    await pumpDialog.locator(":scope > div:not([popover])").evaluate((node) => {
      node.scrollTop = 0;
    });
    await pumpDialog.screenshot({ path: info.outputPath("pump-popup.png") });
    await pumpDialog
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(pumpDialog).toHaveCount(0);
    const move = plan.getByRole("button", { name: "Muovi (M)", exact: true });
    await page.keyboard.press("Escape");
    await move.click();
    await dragPlanDevice(page, plan, plan.getByTestId("heat-pump-2d"), 4, 3);
    await expect(page.locator(".notifica-toast[role=alert]")).toContainText(
      "Posizione rifiutata",
    );
    await expect(move).toHaveAttribute("aria-pressed", "true");
    await dragPlanDevice(page, plan, plan.getByTestId("heat-pump-2d"), 5, -0.6);
    await expect(move).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await plan.getByTestId("heat-pump-2d").locator("rect").click();
    await expect(pumpDialog).toBeVisible();
    await expect(pumpDialog.getByLabel("Nome pompa di calore")).toHaveValue(
      "Pompa esterna",
    );
    await expect(
      pumpDialog
        .getByRole("group", { name: "Ventilconvettori collegati" })
        .getByRole("checkbox"),
    ).toBeChecked();
    await expect(pumpDialog.getByLabel("Marca pompa di calore")).toHaveValue(
      "Chaffoteaux",
    );
    await pumpDialog
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(pumpDialog).toHaveCount(0);
    const fanCoilId = await plan
      .getByTestId("fan-coil-2d")
      .getAttribute("data-device-id");
    await plan.getByTestId("fan-coil-2d").locator("rect").click();
    await equipment
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(equipment).toHaveCount(0);
    await expect(plan.getByTestId("fan-coil-2d")).toHaveAttribute(
      "data-device-id",
      fanCoilId!,
    );
    const result = await saved(page);
    expect(result.fanCoils![0].position.x).toBeCloseTo(3, 1);
    expect(result.heatPumpDrafts).toEqual([]);
    expect(result.hydronicSystems).toHaveLength(1);
    expect(result.hydronicSystems![0].fanCoilIds).toEqual([
      result.fanCoils![0].id,
    ]);
    expect(result.hydronicSystems![0].outdoorUnit.position.x).toBeCloseTo(5, 1);
    expect(result.hydronicSystems![0].outdoorUnit.position.y).toBeCloseTo(
      -0.6,
      1,
    );
    await page.reload();
    await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(1);
    await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
    await plan.getByTestId("heat-pump-2d").locator("rect").click();
    await pumpDialog
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await plan.locator('summary[aria-label="Azioni pompa di calore"]').click();
    page.once("dialog", (dialog) => dialog.accept());
    await plan.getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(0);
    await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(1);
    await plan.locator('summary[aria-label="Altre azioni"]').click();
    await plan
      .getByRole("button", { name: "Annulla ultima modifica", exact: true })
      .click();
    await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
    await plan.screenshot({ path: info.outputPath("equipment-placement.png") });
  });
}

test("main plan preserves room selection and measurement and inserts incomplete vents directly", async ({
  page,
}) => {
  const raw = structuredClone(legacy);
  raw.hvacSystems = [];
  raw.airTerminals = [];
  raw.plenums = [];
  raw.ducts = [];
  raw.installations = [];
  raw.rooms[0].systemType = "none";
  await load(page, raw);
  const plan = await launch(page);
  await page.locator(".stanza-pianta").first().click();
  await expect(page.locator("#proprieta-progetto")).toBeVisible();
  await page.locator('summary[aria-label="Disegno e misure"]').click();
  await page.getByRole("button", { name: "Misura", exact: true }).click();
  await expect(plan.getByTestId("editor-2d")).toHaveClass(/strumento-measure/);
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await point(plan, 4, 2);
  await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: /^Vista Impianto/ }),
  ).toHaveCount(0);
  const project = await saved(page);
  expect(project.installations).toHaveLength(1);
  expect(project.installations[0].type).toBe("ducted");
  expect(project.ductedDrafts).toHaveLength(1);
  await page.reload();
  await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
});

test("desktop workspace has a vertical toolbar and collapsible panels", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await load(page);
  const plan = await launch(page);
  const toolbar = plan.getByRole("toolbar", {
    name: "Strumenti della planimetria",
  });
  const select = await toolbar
    .getByRole("button", { name: "Seleziona", exact: true })
    .boundingBox();
  const machine = await toolbar
    .getByRole("button", { name: "Macchina", exact: true })
    .boundingBox();
  const canvas = page.getByTestId("editor-2d");
  const before = await canvas.boundingBox();
  expect(machine!.x).toBeCloseTo(select!.x, 0);
  expect(machine!.y).toBeGreaterThan(select!.y + select!.height);
  expect(select!.x).toBeLessThan(before!.x);
  await page
    .getByRole("button", { name: "Pannello ambienti", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pannello ambienti", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect((await canvas.boundingBox())!.width).toBeGreaterThan(
    before!.width + 100,
  );
  await expect(
    page.getByRole("button", { name: "Salva", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ripristina", exact: true }),
  ).toBeDisabled();
  await plan.locator('summary[aria-label="Disegno e misure"]').click();
  const drawing = plan.getByRole("button", {
    name: "Stanza rettangolare",
    exact: true,
  });
  await expect(drawing).toBeVisible();
  const drawingBox = await drawing.boundingBox();
  expect(drawingBox!.x).toBeGreaterThan(
    (await toolbar.boundingBox())!.x + (await toolbar.boundingBox())!.width,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Pannello ambienti", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Piano attivo", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("desktop-workspace.png") });
});

test("all equipment uses one plan and cancelling creates no empty installation", async ({
  page,
}, info) => {
  const raw = structuredClone(legacy);
  raw.hvacSystems = [];
  raw.airTerminals = [];
  raw.plenums = [];
  raw.ducts = [];
  raw.installations = [];
  raw.rooms[0].systemType = "none";
  await load(page, raw);
  const plan = await launch(page);
  for (const [index, [label, type]] of [
    ["Radiatore", "radiator"],
    ["Ventilconvettore", "fanCoil"],
    ["Split", "split"],
  ].entries()) {
    await plan.getByRole("button", { name: label, exact: true }).click();
    await point(plan, 3 + index, 2);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await plan.getByTestId(`draft-${type}`).click();
    const popup = page.getByRole("dialog", {
      name: "Configura apparecchio",
      exact: true,
    });
    await expect(popup).toBeVisible();
    await expect(page.getByTestId("editor-2d")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "Nuovo impianto", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lavora sull’impianto", exact: true }),
  ).toHaveCount(0);
  const result = await saved(page);
  expect(result.installations).toEqual([]);
  expect(result.equipmentDrafts).toHaveLength(3);
  await page.screenshot({ path: info.outputPath("unified-plan.png") });
});

test("new fan coils each create an independent installation on the same plan", async ({
  page,
}) => {
  const raw = structuredClone(legacy);
  raw.hvacSystems = [];
  raw.airTerminals = [];
  raw.plenums = [];
  raw.ducts = [];
  raw.installations = [];
  raw.fanCoils = [];
  raw.rooms[0].systemType = "none";
  await load(page, raw);
  const plan = await launch(page);
  for (const x of [2, 6]) {
    await plan
      .getByRole("button", { name: "Ventilconvettore", exact: true })
      .click();
    await point(plan, x, 0.4);
    await plan.getByTestId("draft-fanCoil").click();
    const popup = page.getByRole("dialog", {
      name: "Configura apparecchio",
      exact: true,
    });
    await chooseFanCoilModel(popup, {
      manufacturer: "Aermec",
      model: "FCZ",
    });
    await popup
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByTestId("editor-2d")).toHaveCount(1);
  }
  const result = await saved(page);
  expect(result.fanCoils).toHaveLength(2);
  expect(
    new Set(result.fanCoils!.map((coil) => coil.installationId)).size,
  ).toBe(2);
  expect(result.installations).toHaveLength(2);
  await load(page, result);
  await expect(page.getByTestId("editor-2d")).toHaveCount(1);
});

for (const width of [1920, 1024]) {
  test(`Muovi selects drafts without opening configuration and M moves equipment at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({
      width,
      height: width === 1920 ? 1080 : 768,
    });
    await load(page);
    const plan = await launch(page);
    const move = plan.getByRole("button", {
      name: "Muovi (M)",
      exact: true,
    });
    await expect(move).toBeVisible();
    await move.click();
    await point(plan, 3, 3);
    await expect(plan).toContainText("Trascina l’oggetto");
    await page.keyboard.press("Escape");

    await plan.getByRole("button", { name: "Macchina", exact: true }).click();
    await point(plan, 2, 4);
    const machine = plan.getByRole("button", { name: /^Macchina UI/ });
    const before = await machine.getAttribute("transform");
    await page.keyboard.press("Escape");
    await page.keyboard.press("m");
    await expect(move).toHaveAttribute("aria-pressed", "true");
    await machine.click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await dragPlanDevice(page, plan, machine, 3, 4);
    await expect(machine).not.toHaveAttribute("transform", before!);

    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await point(plan, 4, 2);
    await page.keyboard.press("Escape");
    await move.click();
    const draft = plan.getByTestId("draft-terminal");
    await draft.click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await dragPlanDevice(page, plan, draft, 5, 2);
    const result = await saved(page);
    expect(result.ductedDrafts!.at(-1)!.position.x).toBeCloseTo(5, 1);
    expect(result.ductedDrafts!.at(-1)!.position.y).toBeCloseTo(2, 1);
    expect(result.hvacSystems[0].indoorUnits[0].position.x).toBeCloseTo(3, 1);
    expect(result.hvacSystems[0].indoorUnits[0].position.y).toBeCloseTo(4, 1);
    await page.keyboard.press("M");
    await expect(move).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(move).toHaveAttribute("aria-pressed", "false");
    await plan.screenshot({ path: info.outputPath("move-tool.png") });
  });
}
