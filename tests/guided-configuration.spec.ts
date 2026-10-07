import { readFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { expect, test } from "./browser-test";
import { projectSchema, type Project } from "../src/schemas/project";

// Generate with: node --import tsx scripts/verification/guided-ui.ts.
// Playwright's native ESM loader cannot import this project's catalogue JSON.
const fixtures = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
) as { empty: Project; network: Project; single: Project; otherPorts: number };

async function importFixture(page: Page, project: Project) {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "guided-acceptance.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(project.rooms.length);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
}

async function exported(page: Page, info: TestInfo, name: string) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const file = info.outputPath(`${name}.hvacproj`);
  await (await waiting).saveAs(file);
  return projectSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

test("operator explicitly adds four lengths in the 3D catalogue while the required meters remain separate", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const initial = fixtures.empty;
  await importFixture(page, initial);
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );
  await viewer.getByRole("button", { name: "Bocchette", exact: true }).click();
  const catalog = page.getByRole("dialog", { name: "Catalogo bocchette" });
  await catalog
    .getByRole("combobox", { name: "Ambiente destinazione" })
    .selectOption(initial.rooms[0].id);
  await catalog
    .getByRole("button", { name: "Scegli EDLS", exact: true })
    .click();
  const choice = catalog.getByRole("region", {
    name: "Scelta singola bocchetta",
  });
  await expect(
    choice.getByRole("button", { name: "Aggiungi singola bocchetta" }),
  ).toBeDisabled();
  for (const length of [1000, 2000, 800, 800]) {
    await choice
      .getByRole("textbox", {
        name: "Lunghezza singola bocchetta",
        exact: true,
      })
      .fill(String(length));
    await choice
      .getByRole("button", { name: "Aggiungi singola bocchetta" })
      .click();
  }
  await expect(choice).toContainText("Installati: 4600 mm");
  await catalog.getByRole("button", { name: "Chiudi catalogo" }).click();
  const result = await exported(page, info, "operator-four-pieces");
  expect(result.airTerminals.map((t) => t.widthMm)).toEqual([
    1000, 2000, 800, 800,
  ]);
  expect(result.hvacSystems[0].linearPlan?.requiredSupplyM).toBeCloseTo(4.2);
  expect(result.airTerminals.every((t) => t.decisionOrigin === "manual")).toBe(
    true,
  );
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(4);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  expect(
    (await exported(page, info, "operator-four-reopened")).airTerminals,
  ).toEqual(result.airTerminals);
});

test("all eleven guided steps persist confirmations, pause, final review and reopening", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await importFixture(page, fixtures.empty);
  const wizard = page.getByRole("region", { name: "Configurazione guidata" });
  const steps = page.getByRole("combobox", { name: "Passo configurazione" });
  await expect(steps.locator("option")).toHaveCount(11);
  for (let n = 0; n < 10; n++) {
    await expect(wizard).toContainText(`Passo ${n + 1}/11`);
    await wizard
      .getByRole("button", { name: "Conferma verifica e avanti" })
      .click();
  }
  await expect(wizard).toContainText("Passo 11/11");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(wizard).toContainText("Passo 11/11");
  await wizard
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await expect(wizard).toHaveCount(0);
  await page
    .getByRole("button", { name: "Riprendi configurazione guidata" })
    .click();
  await wizard
    .getByRole("button", { name: "Conferma revisione e termina" })
    .click();
  const project = await exported(page, info, "guided-complete");
  expect(project.floors[0].configurationWizard).toEqual({
    step: 10,
    status: "complete",
    confirmedSteps: Array.from({ length: 11 }, (_, i) => i),
  });
  expect(project.airTerminals).toHaveLength(0);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Rivedi configurazione guidata" }),
  ).toBeVisible();
});

test("dragging the actual 3D X handle commits one move and 2D reload retains it", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const initial = fixtures.single;
  await importFixture(page, initial);
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await page.getByTestId("terminal-supply").click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  const canvas = viewer.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await viewer.getByRole("button", { name: "Sposta 3D", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "Sposta 3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing rendered GPU surface");
  const camera = new PerspectiveCamera(
    Number(await canvas.getAttribute("data-camera-fov")),
    box.width / box.height,
    0.1,
    1000,
  );
  camera.position.fromArray(
    (await canvas.getAttribute("data-camera-position"))!.split(",").map(Number),
  );
  camera.quaternion.fromArray(
    (await canvas.getAttribute("data-camera-quaternion"))!
      .split(",")
      .map(Number),
  );
  camera.updateMatrixWorld();
  const t = initial.airTerminals[0];
  const origin = new Vector3(t.position.x, t.elevationM!, t.position.y);
  // Three's actual TransformControls picker lies 0.3 units along X and scales with camera distance.
  const scale =
    (origin.distanceTo(camera.position) *
      Math.min(1.9 * Math.tan((Math.PI * camera.fov) / 360), 7) *
      0.8) /
    4;
  const start = origin.clone().add(new Vector3(0.3 * scale, 0, 0));
  const end = start.clone().add(new Vector3(0.4, 0, 0));
  const screen = (v: Vector3) => {
    const p = v.project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  };
  const from = screen(start),
    to = screen(end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const moved = await exported(page, info, "gizmo-move");
  expect(moved.airTerminals[0].position.x - t.position.x).toBeGreaterThan(0.2);
  expect(moved.airTerminals[0].position.x - t.position.x).toBeLessThan(0.6);
  expect(moved.airTerminals[0].widthMm).toBe(1000);
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  expect(
    (await exported(page, info, "gizmo-undo")).airTerminals[0].position,
  ).toEqual(t.position);
  await page.getByRole("button", { name: "Ripeti", exact: true }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  expect(
    (await exported(page, info, "gizmo-reopened")).airTerminals[0].position,
  ).toEqual(moved.airTerminals[0].position);
});

test("real GPU view edits the shared terminal and shows channels and pillars after reopen", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const initial = fixtures.network;
  await importFixture(page, initial);
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await page
    .getByRole("combobox", { name: "Elemento nel progetto" })
    .selectOption(initial.airTerminals[0].id);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  const canvas = viewer.locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute(
    "data-selection",
    initial.airTerminals[0].id,
  );
  for (const name of ["Sposta 3D", "Ruota 3D", "Lunghezza 3D"])
    await expect(
      viewer.getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  const edit = page.getByRole("region", { name: "Modifica bocchetta" });
  await edit
    .getByRole("spinbutton", { name: "Lunghezza bocchetta (mm)", exact: true })
    .fill("1800");
  await edit
    .getByRole("button", { name: "Applica modifiche bocchetta" })
    .click();
  let after = await exported(page, info, "edited-in-3d");
  expect(after.airTerminals[0].widthMm).toBe(1800);
  expect(after.airTerminals.slice(1)).toEqual(
    initial.airTerminals
      .slice(1)
      .map((t) => ({ ...t, requiredAirflowM3h: expect.any(Number) })),
  );
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  expect(
    (await exported(page, info, "terminal-undo")).airTerminals[0].widthMm,
  ).toBe(2000);
  await page.getByRole("button", { name: "Ripeti", exact: true }).click();
  await viewer
    .getByRole("button", { name: "Vista Canale", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Genera / aggiorna percorsi proposti" })
    .click();
  after = await exported(page, info, "connected-channels");
  expect(after.ducts!.filter((d) => d.terminalId)).toHaveLength(
    fixtures.otherPorts,
  );
  const netBefore = after.rooms[0].netAreaM2;
  await viewer.getByRole("button", { name: "Pilastro", exact: true }).click();
  const pillar = page.getByRole("dialog", { name: "Aggiungi pilastro" });
  await pillar
    .getByRole("spinbutton", { name: "Larghezza pilastro (mm)" })
    .fill("600");
  await pillar
    .getByRole("spinbutton", { name: "Profondità pilastro (mm)" })
    .fill("800");
  await pillar
    .getByRole("spinbutton", { name: "Posizione X pilastro (m)" })
    .fill("2");
  await pillar
    .getByRole("spinbutton", { name: "Posizione Y pilastro (m)" })
    .fill("2");
  await pillar.getByRole("button", { name: "Inserisci pilastro" }).click();
  after = await exported(page, info, "pillar-and-channels");
  expect(after.pillars).toHaveLength(1);
  expect(after.rooms[0].netAreaM2).toBeCloseTo(netBefore - 0.48);
  await page.screenshot({
    path: info.outputPath("guided-connected-3d.png"),
    fullPage: true,
  });
  await viewer
    .getByRole("button", { name: "Presentazione cliente", exact: true })
    .click();
  await expect(viewer).toContainText(
    "La distribuzione dell’aria, ambiente per ambiente",
  );
  await expect(canvas).toHaveAttribute("data-comfort-mode", "cool");
  expect(
    Number(await canvas.getAttribute("data-comfort-streams")),
  ).toBeGreaterThan(0);
  await viewer
    .getByRole("combobox", { name: "Flusso aria e calore" })
    .selectOption("heat");
  await expect(canvas).toHaveAttribute("data-comfort-mode", "heat");
  await page.screenshot({
    path: info.outputPath("guided-client-tv.png"),
    fullPage: true,
  });
  await viewer
    .getByRole("button", { name: "Torna alla progettazione", exact: true })
    .click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("pillar-2d")).toHaveCount(1);
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  await expect(page.getByTestId("terminal-supply")).toHaveCount(3);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  const restored = await exported(page, info, "reopened-network");
  expect(restored.airTerminals).toEqual(after.airTerminals);
  expect(restored.plenums).toEqual(after.plenums);
  expect(restored.pillars).toEqual(after.pillars);
  expect(restored.ducts).toEqual(after.ducts);
});
