import { pickTerminalLength, terminalLengthButton } from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
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
async function manual(page: Page, model: string, flow: string) {
  const popup = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await popup
    .getByRole("button", { name: "Dati manuali", exact: true })
    .click();
  await popup.getByLabel("Marca macchina manuale").fill("Manuale");
  await popup.getByLabel("Modello macchina manuale").fill(model);
  await popup.getByLabel("Portata massima macchina manuale").fill(flow);
  for (const [label, value] of [
    ["Larghezza", "900"],
    ["Altezza", "250"],
    ["Profondità", "700"],
  ])
    await popup
      .getByLabel(`${label} macchina (mm)`, { exact: true })
      .fill(value);
  await popup.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(popup).toHaveCount(0);
}

for (const width of [1920, 1024])
  test(`complete ducted plan flow and persistent incomplete elements at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const raw = structuredClone(legacy);
    raw.hvacSystems = [];
    raw.airTerminals = [];
    raw.plenums = [];
    raw.ducts = [];
    raw.installations = [
      {
        id: "plan-installation",
        name: "Canalizzato 2D",
        type: "ducted",
        roomIds: [raw.rooms[0].id],
      },
    ];
    raw.rooms[0].systemType = "ducted";
    await load(page, raw);
    const plan = await launch(page);
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await point(plan, 4, 2, true);
    await expect(plan.getByTestId("insertion-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(plan.getByTestId("insertion-preview")).toHaveCount(0);
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(0);
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await point(plan, 4, 2);
    await expect(plan.getByTestId("draft-terminal")).toContainText(
      "Da configurare",
    );
    await plan.getByTestId("draft-terminal").click();
    let terminal = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
      exact: true,
    });
    await terminal
      .getByRole("button", { name: "Scegli EDLS", exact: true })
      .click();
    await pickTerminalLength(terminal, 1000);
    await terminal
      .getByRole("button", { name: "Annulla", exact: true })
      .last()
      .click();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
    await plan.getByRole("button", { name: "Macchina", exact: true }).click();
    await point(plan, 2, 4);
    const incomplete = await saved(page);
    expect(incomplete.ductedDrafts).toHaveLength(2);
    expect(incomplete.hvacSystems).toHaveLength(0);
    expect(incomplete.airTerminals).toHaveLength(0);
    await page.reload();
    await launch(page);
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
    await expect(plan.getByTestId("draft-machine")).toHaveCount(1);
    await plan.getByTestId("draft-terminal").click();
    await terminal
      .getByRole("button", { name: "Scegli EDLS", exact: true })
      .click();
    await pickTerminalLength(terminal, 1000);
    await expect(terminal.getByLabel("Finitura scelta")).toHaveCount(0);
    await openDisclosure(terminal, "Aspetto e finiture facoltativi");
    await terminal
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
      .click();
    const footer = terminal.locator("footer");
    await expect(terminalLengthButton(terminal, 999)).toHaveCount(0);
    await pickTerminalLength(terminal, 1000);
    await footer.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(terminal).toHaveCount(0);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await expect(plan.getByTestId("air-connection")).toHaveCount(0);
    await plan.getByTestId("draft-machine").click();
    const machine = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
    });
    await machine
      .getByRole("button", { name: "Dati manuali", exact: true })
      .click();
    await machine.getByLabel("Marca macchina manuale").fill("Scartata");
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-machine").click();
    await manual(page, "Macchina A", "900");
    await expect(plan.getByTestId("machine-airflow")).toContainText(
      "Massima:900,00 m³/h",
    );
    await expect(plan.getByTestId("machine-airflow")).toContainText(
      "Da coprire:900,00 m³/h",
    );
    await expect(plan.getByTestId("draft-machine")).toHaveCount(0);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await point(plan, 4, 2, true);
    await expect(plan.getByTestId("connection-preview")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(plan.getByTestId("connection-preview")).toHaveCount(0);
    await expect(plan.getByTestId("air-connection")).toHaveCount(0);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("terminal-supply").click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await expect(plan.getByTestId("air-connection")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await plan.getByTestId("terminal-supply").click();
    terminal = page.getByRole("dialog", {
      name: "Configura bocchetta",
      exact: true,
    });
    await expect(terminalLengthButton(terminal, 1000)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      terminal.getByRole("button", { name: "RAL 9016 · Bianco", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await pickTerminalLength(terminal, 1500);
    await page.keyboard.press("Escape");
    await plan.getByTestId("terminal-supply").click();
    await expect(terminalLengthButton(terminal, 1000)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pickTerminalLength(terminal, 1500);
    await terminal
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(
      plan.getByTestId("terminal-supply").locator("rect"),
    ).toHaveAttribute("width", "1.5");
    await plan.getByRole("button", { name: "Macchina", exact: true }).click();
    await point(plan, 6, 4);
    await plan.getByTestId("draft-machine").click();
    await manual(page, "Macchina B", "500");
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan
      .getByRole("button", { name: /^Macchina UI/ })
      .last()
      .click();
    await plan.getByTestId("terminal-supply").click();
    await expect(plan.getByTestId("air-connection")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await plan.getByTestId("terminal-supply").click();
    await terminal
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await plan.locator('summary[aria-label="Azioni bocchetta"]').click();
    await plan.getByRole("button", { name: "Scollega" }).click();
    await expect(plan.getByTestId("air-connection")).toHaveCount(0);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("terminal-supply").click();
    await plan
      .getByRole("button", { name: /^Macchina UI/ })
      .last()
      .click();
    await expect(
      plan.getByRole("button", { name: "Collega", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await plan.getByTestId("terminal-supply").click();
    await terminal
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    const selectedTerminalId = await plan
      .getByTestId("terminal-supply")
      .getAttribute("data-device-id");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await expect(
      page.getByTestId("viewer-3d").locator("canvas"),
    ).toHaveAttribute("data-selection", selectedTerminalId!);
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await expect(plan).toBeVisible();
    await expect(page.getByTestId("editor-2d")).toHaveCount(1);
    await plan.screenshot({ path: info.outputPath("plan.png") });
    await page.screenshot({ path: info.outputPath("main-screen.png") });
    const configured = await saved(page);
    expect(configured.hvacSystems).toHaveLength(2);
    expect(
      new Set(configured.hvacSystems.map((machine) => machine.installationId))
        .size,
    ).toBe(2);
    expect(configured.airTerminals[0].installationId).toBe(
      configured.hvacSystems[1].installationId,
    );
    await expect(
      page.getByRole("button", { name: "Nuovo impianto", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: /^Planimetria operativa/ }),
    ).toHaveCount(0);
    for (const machine of configured.hvacSystems) {
      const installed = configured.airTerminals
        .filter(
          (terminal) =>
            terminal.systemId === machine.id && terminal.use === "supply",
        )
        .reduce((sum, terminal) => sum + terminal.availableAirflowM3h, 0);
      const maximum = machine.genericMachine!.maxAirflowM3h;
      const label = plan.locator(
        `[data-testid="machine-airflow"][data-system-id="${machine.id}"]`,
      );
      const fitsInside = await label.evaluate((node) => {
        const text = (node as SVGGraphicsElement).getBBox();
        const body = (
          node.parentElement!.querySelector("rect") as SVGRectElement
        ).getBBox();
        return (
          text.x >= body.x &&
          text.y >= body.y &&
          text.x + text.width <= body.x + body.width &&
          text.y + text.height <= body.y + body.height
        );
      });
      expect(fitsInside).toBe(true);
      await expect(label).toContainText(
        `Massima:${maximum.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³/h`,
      );
      await expect(label).toContainText(
        `Da coprire:${Math.max(0, maximum - installed).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m³/h`,
      );
    }

    expect(configured.ductedDrafts).toEqual([]);
    expect(configured.airTerminals[0]).toMatchObject({
      widthMm: 1500,
      color: "RAL9016",
      finish: "RAL9016",
      systemId: configured.hvacSystems[1].id,
    });
    await load(page, configured);
    await launch(page);
    await expect(
      plan.getByRole("button", { name: /^Macchina UI/ }),
    ).toHaveCount(2);
    await expect(plan.getByTestId("air-connection")).toHaveCount(1);
    await plan.getByTestId("terminal-supply").click();
    await expect(terminalLengthButton(terminal, 1500)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await terminal.screenshot({ path: info.outputPath("popup.png") });
  });

test("previous project exposes the ducted tools on the main plan", async ({
  page,
}) => {
  await load(page);
  const plan = await launch(page);
  await expect(page.getByTestId("editor-2d")).toHaveCount(1);
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await point(plan, 2, 4);
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
    await equipment
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(equipment).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("m");
    await plan.getByTestId("fan-coil-2d").click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await point(plan, 3, 0.4);

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
    await pumpDialog.locator(":scope > div").evaluate((node) => {
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
    await plan.getByTestId("heat-pump-2d").locator("rect").click();
    await point(plan, 4, 3);
    await expect(plan.getByRole("alert").first()).toContainText(
      "Posizione rifiutata",
    );
    await expect(move).toHaveAttribute("aria-pressed", "true");
    await point(plan, 5, -0.6);
    await expect(move).toHaveAttribute("aria-pressed", "false");
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
  for (const [label, type] of [
    ["Radiatore", "radiator"],
    ["Ventilconvettore", "fanCoil"],
    ["Split", "split"],
  ]) {
    await plan.getByRole("button", { name: label, exact: true }).click();
    await point(plan, 4, 2);
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
    await expect(plan).toContainText("Seleziona prima l’elemento da muovere.");
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
    await point(plan, 3, 4);
    await expect(machine).not.toHaveAttribute("transform", before!);

    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await point(plan, 4, 2);
    await page.keyboard.press("Escape");
    await move.click();
    const draft = plan.getByTestId("draft-terminal");
    await draft.click();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await point(plan, 5, 2);
    const result = await saved(page);
    expect(result.ductedDrafts!.at(-1)!.position.x).toBeCloseTo(5, 1);
    expect(result.ductedDrafts!.at(-1)!.position.y).toBeCloseTo(2, 1);
    expect(result.hvacSystems[0].indoorUnits[0].position.x).toBeCloseTo(3, 1);
    expect(result.hvacSystems[0].indoorUnits[0].position.y).toBeCloseTo(4, 1);
    await page.keyboard.press("M");
    await page.keyboard.press("Escape");
    await expect(move).toHaveAttribute("aria-pressed", "false");
    await plan.screenshot({ path: info.outputPath("move-tool.png") });
  });
}
