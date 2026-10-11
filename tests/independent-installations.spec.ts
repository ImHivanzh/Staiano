import { chooseTerminalModel, confirmTerminalPlacement } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openInspector, openDisclosure } from "./ui-helpers";
import { readFileSync } from "node:fs";

test("one type per installation, independent radiator system in the same room, both visible in the overview", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  const popup = page.getByRole("dialog", {
    name: "Configura impianto",
    exact: true,
  });
  const types = popup.getByRole("group", { name: "Impianto da configurare" });
  await types.getByRole("button", { name: "Canalizzato", exact: true }).click();
  await popup
    .getByRole("button", { name: "Scegli macchina", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  await picker
    .getByRole("button", { name: "Configura canalizzato", exact: true })
    .click();
  await expect(
    types.getByRole("button", { name: "Radiatori", exact: true }),
  ).toBeDisabled();
  const models = popup.getByLabel("Modello bocchetta", { exact: true });
  await expect(models).toContainText("EDLS");
  await expect(models).toContainText("EDFL-20");
  await expect(models).toContainText("EDSC-C");
  await chooseTerminalModel(popup, "EDFL-20");
  await expect(popup.getByLabel("Numero di feritoie")).toBeVisible();
  await chooseTerminalModel(popup, "EDLS");
  await popup
    .getByLabel("Lunghezza singola bocchetta", { exact: true })
    .fill("1000");
  await popup
    .getByRole("button", { name: "Posiziona nell’ambiente", exact: true })
    .click();
  await confirmTerminalPlacement(page);
  const diagram = popup.getByRole("img", {
    name: /^Schema plenum di mandata:/,
  });
  await expect(diagram).toBeVisible();
  const bounds = (await diagram.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(300);
  expect(bounds.height).toBeLessThanOrEqual(180);
  const firstId = await popup.getByLabel("Impianto corrente").inputValue();
  await popup
    .getByRole("button", { name: "Nuovo impianto", exact: true })
    .click();
  const secondId = await popup.getByLabel("Impianto corrente").inputValue();
  expect(secondId).not.toBe(firstId);
  await expect(popup.getByLabel("Impianto corrente")).toContainText(
    "Impianto 2 · Radiatori · 1 stanza",
  );
  await popup.getByLabel("Marca radiatori").selectOption("Global");
  await popup.getByLabel("Famiglia radiatori").selectOption("VIP");
  await popup
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  await popup
    .locator(".soluzione-radiatore")
    .first()
    .getByRole("button", { name: "Applica e posiziona" })
    .click();
  await expect(
    types.getByRole("button", { name: "Canalizzato", exact: true }),
  ).toBeDisabled();
  await popup.getByLabel("Impianto corrente").selectOption(firstId);
  await expect(
    popup.getByRole("region", { name: "Plenum di mandata" }),
  ).toBeVisible();
  await popup.getByLabel("Impianto corrente").selectOption(secondId);
  await expect(
    popup.getByRole("button", { name: "Rimuovi radiatori" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("independent-installations.png"),
  });
  await popup
    .getByRole("button", { name: "Nuovo impianto", exact: true })
    .click();
  await types.getByRole("button", { name: "Canalizzato", exact: true }).click();
  await popup
    .getByRole("button", { name: "Scegli macchina", exact: true })
    .click();
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  await picker
    .getByRole("button", { name: "Configura canalizzato", exact: true })
    .click();
  await chooseTerminalModel(popup, "EDLS");
  await popup
    .getByLabel("Lunghezza singola bocchetta", { exact: true })
    .fill("500");
  await popup
    .getByRole("button", { name: "Posiziona nell’ambiente", exact: true })
    .click();
  await confirmTerminalPlacement(page);
  await popup.getByLabel("Impianto corrente").selectOption(firstId);
  await expect(
    popup.getByRole("region", { name: "Sistema canalizzato", exact: true }),
  ).toContainText("Impianto 1");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("terminal-supply")).toHaveCount(2);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(2);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const overview = page.getByTestId("installation-overview");
  await openDisclosure(overview, "Impianti");
  await expect(overview).toContainText("Impianto 1 · Canalizzato");
  await expect(overview).toContainText("Impianto 2 · Radiatori");
});

test("wizard adds and configures one installation at a time without copying the first room group", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).threeRooms;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "separate-installations.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const wizard = page.getByRole("region", { name: "Configurazione guidata" });
  await wizard.getByRole("navigation").getByRole("button").nth(3).click();
  const list = wizard.getByRole("region", { name: "Impianti del progetto" });
  await expect(
    list.getByRole("button", { name: "Aggiungi impianto", exact: true }),
  ).toBeVisible();
  await list
    .getByRole("button", { name: "Aggiungi impianto", exact: true })
    .click();
  const popup = page.getByRole("dialog", {
    name: "Configura impianto",
    exact: true,
  });
  await expect(popup.getByLabel("Impianto corrente")).toContainText(
    "Impianto 2 · Radiatori · 1 stanza",
  );
  await popup.getByLabel("Marca radiatori").selectOption("Global");
  await popup.getByLabel("Famiglia radiatori").selectOption("VIP");
  await popup.getByLabel("Numero radiatori").fill("3");
  await popup
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  await popup
    .locator(".soluzione-radiatore")
    .first()
    .getByRole("button", { name: "Applica e posiziona" })
    .click();
  await page.keyboard.press("Escape");
  await expect(list).toContainText("Impianto 2 · Radiatori");
  await expect(
    list.getByRole("button", { name: "Configura Impianto 2", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("wizard-installations.png") });
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const saved = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(
    saved.installations.find((item: { type: string }) => item.type === "ducted")
      .roomIds,
  ).toHaveLength(3);
  expect(
    saved.installations.find(
      (item: { name: string }) => item.name === "Impianto 2",
    ).roomIds,
  ).toHaveLength(1);
  expect(saved.hvacSystems).toHaveLength(1);
  expect(saved.radiators.length).toBeGreaterThan(0);
});
