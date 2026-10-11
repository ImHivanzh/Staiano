import { chooseTerminalModel, confirmTerminalPlacement } from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

async function expectPopupFrame(
  dialog: Locator,
  viewport: { width: number; height: number },
) {
  const margin = viewport.width <= 1200 ? 16 : 32;
  const width = Math.min(1440, viewport.width - margin * 2);
  await expect
    .poll(async () => {
      const bounds = await dialog.boundingBox();
      return (
        bounds &&
        Object.fromEntries(
          Object.entries(bounds).map(([key, value]) => [
            key,
            Math.round(value),
          ]),
        )
      );
    })
    .toEqual({
      x: (viewport.width - width) / 2,
      y: margin,
      width,
      height: viewport.height - margin * 2,
    });
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`rounded popup canalizzazione and machine choice at ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Disegna manualmente" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crea stanza", exact: true })
      .click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    await openDisclosure(viewer, "Aggiungi apparecchio");
    await viewer
      .getByRole("button", { name: "Bocchette", exact: true })
      .click();
    const launch = page.getByRole("button", {
      name: "Configura canalizzazione",
      exact: true,
    });
    await expect(page.getByLabel("Ambiente destinazione")).toBeHidden();
    await launch.click();
    const configuration = page.getByRole("dialog", {
      name: "Configura canalizzazione",
      exact: true,
    });
    await expect(configuration).toBeVisible();
    expect(await configuration.evaluate((node) => node.matches(":modal"))).toBe(
      true,
    );
    await expectPopupFrame(configuration, viewport);
    await configuration
      .getByRole("button", { name: "Scegli macchina", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await expect(picker).toBeVisible();
    await expectPopupFrame(picker, viewport);
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(configuration).toBeVisible();
    await configuration
      .getByRole("button", { name: "Scegli macchina", exact: true })
      .click();
    await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
    const models = picker
      .getByRole("region", { name: "Modelli macchina compatibili" })
      .getByRole("button");
    expect(await models.count()).toBeGreaterThan(1);
    await models.last().click();
    const chosenModel = await models.last().locator("strong").innerText();
    await picker.screenshot({ path: info.outputPath("machine-picker.png") });
    await picker
      .getByRole("button", { name: "Configura canalizzato", exact: true })
      .click();
    await expect(picker).toBeHidden();
    await expect(
      configuration.getByRole("button", {
        name: "Cambia macchina",
        exact: true,
      }),
    ).toBeVisible();
    await chooseTerminalModel(configuration, "EDLS");
    const choice = configuration.getByRole("region", {
      name: "Scelta singola bocchetta",
    });
    await choice
      .getByLabel("Lunghezza singola bocchetta", { exact: true })
      .fill("1000");
    await choice
      .getByRole("button", { name: "Posiziona nell’ambiente" })
      .click();
    await confirmTerminalPlacement(page);
    await openDisclosure(configuration, "Bilancio bocchette per ambiente");
    await expect(configuration).toContainText("Installati: 1000 mm");
    await configuration.screenshot({
      path: info.outputPath("duct-configuration.png"),
    });
    expect(
      await configuration.evaluate(
        (node) => node.scrollWidth <= node.clientWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(configuration).toBeHidden();
    await expect(launch).toBeFocused();
    await launch.click();
    await expect(configuration).toContainText(
      "Bocchetta posizionata. Totale aggiornato.",
    );
    await configuration
      .getByRole("button", { name: "Cambia macchina", exact: true })
      .click();
    await expect(
      models.filter({ hasText: chosenModel }).first(),
    ).toHaveAttribute("aria-pressed", "true");
    await models.first().click();
    await picker
      .getByRole("button", {
        name: "Aggiorna sistema canalizzato",
        exact: true,
      })
      .click();
    await configuration
      .getByRole("button", { name: "Chiudi configurazione" })
      .click();
    await page.getByRole("button", { name: "Chiudi catalogo" }).click();
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const project = projectSchema.parse(
      JSON.parse(readFileSync((await (await download).path())!, "utf8")),
    );
    expect(project.airTerminals).toHaveLength(1);
    expect(project.airTerminals[0].widthMm).toBe(1000);
    expect(project.airTerminals[0].systemId).toBe(project.hvacSystems[0].id);
    await openDisclosure(viewer, "Aggiungi apparecchio");
    await viewer.getByRole("button", { name: "Plenum", exact: true }).click();
    const plenum = page.getByRole("dialog", {
      name: "Plenum degli impianti autonomi",
    });
    await expect(plenum).toBeVisible();
    await expectPopupFrame(plenum, viewport);
    await expect(
      plenum.getByRole("button", { name: "Cambia macchina", exact: true }),
    ).toBeVisible();
    await plenum.getByRole("button", { name: "Chiudi plenum" }).click();
    await openDisclosure(viewer, "Aggiungi apparecchio");
    await viewer
      .getByRole("button", { name: "Macchina manuale", exact: true })
      .click();
    const manual = page.getByRole("dialog", { name: "Catalogo macchine" });
    await expect(manual).toBeVisible();
    await expectPopupFrame(manual, viewport);
    await page.keyboard.press("Escape");
    await expect(manual).toHaveCount(0);
    await openDisclosure(viewer, "Vista 3D");
    await viewer
      .getByRole("button", { name: "Vista Canale", exact: true })
      .click();
    await viewer.getByRole("button", { name: "Configura percorsi" }).click();
    const channels = page.getByRole("dialog", {
      name: "Canalizzazione collegata",
      exact: true,
    });
    await expect(channels).toBeVisible();
    await expectPopupFrame(channels, viewport);
    await channels.getByRole("button", { name: "Chiudi canali" }).click();
  });

  test(`extended rounded popup surfaces at ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Disegna manualmente" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crea stanza", exact: true })
      .click();
    await openInspector(page, "Configura impianto");
    const systems = page.getByRole("dialog", {
      name: "Configura impianto",
      exact: true,
    });
    await expectPopupFrame(systems, viewport);
    for (const [mode, heading] of [
      ["Radiatori", "Dimensiona radiatori"],
      ["Split", "Climatizzatori split"],
      ["Ventilconvettori", "Ventilconvettori"],
    ]) {
      await systems
        .getByRole("group", { name: "Impianto da configurare" })
        .getByRole("button", { name: mode, exact: true })
        .click();
      await expect(
        systems.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await systems.screenshot({
      path: info.outputPath("systems-rounded popup.png"),
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Configura impianto", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    for (const [action, title] of [
      ["Ventilconvettori", "Ventilconvettori e comandi"],
      ["Pompa di calore", "Impianto idronico · macchina esterna"],
    ]) {
      await openDisclosure(viewer, "Aggiungi apparecchio");
      await viewer.getByRole("button", { name: action, exact: true }).click();
      const popup = page.getByRole("dialog", { name: title, exact: true });
      await expect(popup).toBeVisible();
      await expectPopupFrame(popup, viewport);
      if (action === "Ventilconvettori") {
        await popup
          .getByLabel("Ambiente ventilconvettore")
          .selectOption({ label: "Soggiorno" });
        await expect(
          popup.getByRole("button", { name: "Aggiungi ventilconvettore" }),
        ).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
    }
    await openDisclosure(page, "File");
    await page
      .getByRole("button", { name: "Listino materiali", exact: true })
      .click();
    const bill = page.getByRole("dialog", {
      name: "Listino materiali Ecoclima",
    });
    await expect(bill).toBeVisible();
    await expectPopupFrame(bill, viewport);
    await page.keyboard.press("Escape");
    await expect(bill).toHaveCount(0);
    await openDisclosure(page, "File");
    await page.getByRole("checkbox", { name: "Includi render 3D" }).uncheck();
    await page
      .getByRole("button", { name: "Anteprima PDF", exact: true })
      .click();
    const pdf = page.getByRole("dialog", { name: "Anteprima dossier PDF" });
    await expect(pdf.getByTestId("pdf-preview-page")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    await expectPopupFrame(pdf, viewport);
    await pdf.getByRole("button", { name: "Chiudi anteprima PDF" }).click();
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await openDisclosure(page, "Modifica");
    await page
      .getByRole("button", { name: "Importa planimetria", exact: true })
      .click();
    const plan = page.getByRole("dialog", { name: "Importa planimetria" });
    await expect(plan).toBeVisible();
    await expectPopupFrame(plan, viewport);
    await expect(plan.getByLabel("File planimetria")).toBeVisible();
    await plan.screenshot({
      path: info.outputPath("import-rounded popup.png"),
    });
    await page.keyboard.press("Escape");
    await expect(plan).toHaveCount(0);
  });
}

test("2D inspector opens canalizzazione rounded popup and changes the chosen machine", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  await page
    .getByRole("group", { name: "Impianto da configurare" })
    .getByRole("button", { name: "Canalizzato", exact: true })
    .click();

  const configuration = page.getByRole("dialog", {
    name: "Configura impianto",
    exact: true,
  });
  await expect(configuration).toBeVisible();
  await configuration
    .getByRole("button", { name: "Scegli macchina", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  await picker
    .getByRole("region", { name: "Modelli macchina compatibili" })
    .getByRole("button")
    .filter({ hasText: "FBA50A9" })
    .click();
  await picker
    .getByRole("button", { name: "Configura canalizzato", exact: true })
    .click();
  await expect(
    configuration.getByRole("heading", { name: "FBA50A9", exact: true }),
  ).toBeVisible();
  await configuration
    .getByRole("button", { name: "Cambia macchina", exact: true })
    .click();
  await picker
    .getByRole("region", { name: "Modelli macchina compatibili" })
    .getByRole("button")
    .filter({ hasText: "FBA60A9" })
    .click();
  await picker
    .getByRole("button", { name: "Aggiorna sistema canalizzato", exact: true })
    .click();
  await expect(
    configuration.getByRole("heading", { name: "FBA60A9", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(configuration).toBeHidden();
  await page
    .getByRole("button", { name: "Configura impianto", exact: true })
    .click();
  await expect(
    configuration.getByRole("heading", { name: "FBA60A9", exact: true }),
  ).toBeVisible();
});

test("wizard and selected plenum open their detailed configuration rounded popup", async ({
  page,
}) => {
  const network = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).network;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "plenum-popup.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(network)),
  });
  const wizard = page.getByRole("region", { name: "Configurazione guidata" });
  await wizard.getByRole("navigation").getByRole("button").nth(3).click();
  await openDisclosure(wizard, "Plenum e bocchette");
  await openDisclosure(wizard, "plenum dedicato");
  await wizard
    .getByRole("button", { name: "Configura plenum", exact: true })
    .click();
  const popup = page.getByRole("dialog", {
    name: "Configura plenum",
    exact: true,
  });
  await expect(
    popup.getByRole("region", { name: "Plenum di mandata" }),
  ).toBeVisible();
  await expectPopupFrame(popup, { width: 1920, height: 1080 });
  await page.keyboard.press("Escape");
  await expect(
    wizard.getByRole("button", { name: "Configura plenum", exact: true }),
  ).toBeFocused();
  await wizard
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await page.getByTestId("plenum-2d").click();
  await page
    .getByRole("button", { name: "Collegamenti e scheda plenum", exact: true })
    .click();
  const details = page.getByRole("dialog", {
    name: "Collegamenti e scheda plenum",
    exact: true,
  });
  await expect(
    details.getByRole("region", { name: "Plenum di mandata" }),
  ).toBeVisible();
  await expectPopupFrame(details, { width: 1920, height: 1080 });
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
});
