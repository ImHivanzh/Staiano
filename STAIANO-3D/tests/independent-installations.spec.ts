import { readFileSync } from "node:fs";

import type { Page, Locator } from "@playwright/test";

import { expect, test } from "./browser-test";

import { chooseFanCoilModel, openDisclosure, pickPlanPoint } from "./ui-helpers";

import { projectSchema } from "../src/schemas/project";

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();

  return page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
}

async function saved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");

  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");

  await page.getByRole("button", { name: "Esporta", exact: true }).click();

  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

async function addEquipment(
  page: Page,
  plan: Locator,
  label: string,
  type: string,
  x: number,
  y: number,
) {
  await plan.getByRole("button", { name: label, exact: true }).click();
  await pickPlanPoint(plan, x, y);

  await plan.getByTestId(`draft-${type}`).last().click();

  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });

  if (type === "radiator") {
    await popup
      .getByRole("group", { name: "Marca radiatori", exact: true })
      .getByRole("button", { name: "Global", exact: true })
      .click();

    await popup
      .getByRole("group", { name: "Famiglia radiatori", exact: true })
      .getByText("VIP", { exact: true })
      .click();

    await popup
      .getByLabel("Potenza da coprire con questo punto (W)")
      .fill("1800");

    await popup
      .getByRole("button", { name: "Trova radiatori compatibili" })
      .click();
    await expect(
      popup.getByRole("button", { name: "Selezionata", exact: true }),
    ).toBeEnabled();
  }

  if (type === "fanCoil")
    await chooseFanCoilModel(popup, {
      manufacturer: "Aermec",
      model: "FCZ",
    });

  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();

  await expect(popup).toHaveCount(0);
}

for (const width of [1920, 1024]) {
  test(`delete an accidental installation: cancel, confirm, undo and reload at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });

    const plan = await start(page);

    await addEquipment(page, plan, "Ventilconvettore", "fanCoil", 1, 0.4);

    await addEquipment(page, plan, "Ventilconvettore", "fanCoil", 3, 0.4);

    const before = await saved(page);
    expect(before.installations).toHaveLength(2);

    expect(
      new Set(before.fanCoils!.map((unit) => unit.installationId)).size,
    ).toBe(2);

    await openDisclosure(plan, "Azioni apparecchio");

    page.once("dialog", (dialog) => dialog.dismiss());
    await plan.getByRole("button", { name: "Elimina", exact: true }).click();

    await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(2);

    await openDisclosure(plan, "Azioni apparecchio");

    page.once("dialog", (dialog) => dialog.accept());
    await plan.getByRole("button", { name: "Elimina", exact: true }).click();

    await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(1);

    const remaining = await saved(page);
    expect(remaining.fanCoils![0]).toEqual(before.fanCoils![0]);

    expect(remaining.installations).toHaveLength(1);

    await page
      .getByRole("group", { name: "Comandi rapidi progetto" })
      .getByRole("button", { name: "Annulla", exact: true })
      .click();

    await expect(plan.getByTestId("fan-coil-2d")).toHaveCount(2);

    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.reload();

    const restored = await saved(page);
    expect(restored.fanCoils).toEqual(before.fanCoils);

    expect(restored.installations).toEqual(before.installations);
  });
}

test("canalizzato and radiators stay independent in the same room and overview", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const plan = await start(page);
  await addEquipment(page, plan, "Radiatore", "radiator", 1, 0.4);

  const before = await saved(page);

  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 2);

  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 3, 0.5);

  await plan.getByRole("button", { name: "Collega", exact: true }).click();

  await plan.getByTestId("draft-machine").click();
  await plan.getByTestId("draft-terminal").click();
  await page.keyboard.press("Escape");

  await plan.getByTestId("draft-machine").click();
  const popup = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
    exact: true,
  });

  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(popup).toHaveCount(0);

  const both = await saved(page);
  expect(both.installations).toHaveLength(2);
  expect(both.radiators).toEqual(before.radiators);

  expect(both.hvacSystems).toHaveLength(1);
  expect(both.installations.map((item) => item.type).sort()).toEqual([
    "ducted",
    "radiator",
  ]);

  await openDisclosure(plan, "Azioni macchina");
  page.once("dialog", (dialog) => dialog.accept());

  await plan.getByRole("button", { name: "Elimina", exact: true }).click();

  const remaining = await saved(page);
  expect(remaining.hvacSystems).toEqual([]);
  expect(remaining.radiators).toEqual(before.radiators);
});

test("wizard adds and configures one installation at a time without copying the first room group", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const raw = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).threeRooms;

  for (const key of [
    "hvacSystems",
    "installations",
    "airTerminals",
    "plenums",
    "ducts",
    "fanCoils",
    "radiators",
    "hydronicSystems",
    "ductedDrafts",
    "heatPumpDrafts",
    "equipmentDrafts",
  ])
    raw[key] = [];

  raw.rooms.forEach((room: { systemType: string }) => {
    room.systemType = "none";
  });

  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "independent.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });

  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();

  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });

  for (const room of raw.rooms.slice(0, 2))
    await addEquipment(
      page,
      plan,
      "Radiatore",
      "radiator",
      room.centroid.x,
      room.centroid.y,
    );

  const result = await saved(page);
  expect(result.installations).toHaveLength(2);

  expect(result.installations.every((item) => item.roomIds.length === 1)).toBe(
    true,
  );

  expect(
    new Set(result.installations.flatMap((item) => item.roomIds)).size,
  ).toBe(2);

  await page
    .getByRole("button", { name: "Riprendi wizard", exact: true })
    .click();

  const wizard = page.getByRole("region", { name: "Configurazione guidata" });

  await wizard.getByRole("navigation").getByRole("button").nth(3).click();

  await expect(wizard).toContainText("Impianti");
});
