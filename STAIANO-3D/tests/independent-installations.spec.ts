import { pickTerminalLength } from "./ui-helpers";
import { pickPlanPoint } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openInspector, openDisclosure } from "./ui-helpers";
import { readFileSync } from "node:fs";

for (const width of [1920, 1024]) {
  test(`delete an accidental installation: cancel, confirm, undo and reload at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const fixture = JSON.parse(
      readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
    ).empty;
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "delete-installation.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page
      .getByRole("button", { name: "Continua liberamente nell’editor" })
      .click();
    await page.locator(".stanza-pianta").first().click();
    await openInspector(page, "Configura impianto");
    const popup = page.getByRole("dialog", {
      name: /^(?:Vista |Configura impianto$)/,
      exact: true,
    });
    const current = popup.getByLabel("Impianto corrente");
    const originalId = await current.inputValue();
    await popup
      .getByRole("button", { name: "Nuovo impianto", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Nuovo impianto", exact: true })
      .getByRole("button", { name: "Crea impianto e apri vista" })
      .click();
    const accidentalId = await current.inputValue();
    await expect(current.locator("option")).toHaveCount(2);
    const remove = popup.getByRole("button", {
      name: "Elimina impianto",
      exact: true,
    });
    await expect(remove).toBeInViewport();
    await popup.screenshot({
      path: info.outputPath("delete-installation.png"),
    });
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Impianto 2");
      await dialog.dismiss();
    });
    await remove.click();
    await expect(current).toHaveValue(accidentalId);
    await expect(current.locator("option")).toHaveCount(2);
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect(popup).toHaveCount(0);
    await openInspector(page, "Configura impianto");
    await expect(current).toHaveValue(originalId);
    await expect(current.locator("option")).toHaveCount(1);
    await popup
      .getByRole("button", { name: "Chiudi configurazione", exact: true })
      .click();
    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.reload();
    await page.locator(".stanza-pianta").first().click();
    await openInspector(page, "Configura impianto");
    await expect(current.locator("option")).toHaveCount(2);
    await current.selectOption(originalId);
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect(popup).toHaveCount(0);
    await openInspector(page, "Configura impianto");
    await expect(current).toHaveValue(accidentalId);
    await expect(current.locator("option")).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await remove.click();
    await expect(popup).toHaveCount(0);
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const saved = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(saved.installations).toHaveLength(0);
    expect(saved.hvacSystems).toHaveLength(0);
    expect(saved.rooms).toHaveLength(fixture.rooms.length);
    expect(saved.rooms[0].systemType).toBe("none");
  });
}

test("canalizzato and radiators stay independent in the same room and overview", async ({
  page,
}) => {
  test.setTimeout(90000);
  const fixture = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).empty;
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "independent.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await page.getByRole("button", { name: "Lavora sull’impianto" }).click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 4);
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 4, 2);
  await plan.getByTestId("draft-terminal").click();
  const terminal = page.getByRole("dialog", {
    name: "Scegli bocchetta sul punto",
  });
  await terminal
    .getByRole("button", { name: "Scegli EDLS", exact: true })
    .click();
  await pickTerminalLength(terminal, 1000);
  await terminal
    .getByRole("group", { name: "Colore scelto", exact: true })
    .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
    .click();
  await terminal
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Torna all’editor", exact: true })
    .click();
  await page.locator(".stanza-pianta").first().click();
  await openInspector(page, "Configura impianto");
  const popup = page.getByRole("dialog", {
    name: /^(?:Vista |Configura impianto$)/,
  });
  const types = popup.getByRole("group", { name: "Impianto da configurare" });
  await expect(
    types.getByRole("button", { name: "Radiatori", exact: true }),
  ).toBeDisabled();
  await popup
    .getByRole("button", { name: "Nuovo impianto", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Nuovo impianto", exact: true })
    .getByRole("button", { name: "Crea impianto e apri vista" })
    .click();
  await openDisclosure(popup, "Configurazione da modulo e dettagli tecnici");
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
  await expect(
    types.getByRole("button", { name: "Canalizzato", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("terminal-supply")).toHaveCount(1);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(3);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(1);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(3);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const overview = page.getByTestId("installation-overview");
  await openDisclosure(overview, "Impianti");
  await expect(overview).toContainText("Canalizzato");
  await expect(overview).toContainText("Radiatori");
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
  await page
    .getByRole("dialog", { name: "Nuovo impianto", exact: true })
    .getByRole("button", { name: "Crea impianto e apri vista" })
    .click();
  const popup = page.getByRole("dialog", {
    name: /^(?:Vista |Configura impianto$)/,
    exact: true,
  });
  await expect(popup.getByLabel("Impianto corrente")).toContainText(
    "Impianto 2 · Radiatori · 1 stanza",
  );
  await openDisclosure(popup, "Configurazione da modulo e dettagli tecnici");
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
