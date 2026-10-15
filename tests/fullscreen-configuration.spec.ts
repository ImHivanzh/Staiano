import { pickPlanPoint } from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";

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
    await page
      .getByRole("button", { name: "Configura canalizzazione", exact: true })
      .click();
    const configuration = page.getByRole("dialog", {
      name: "Configura canalizzazione",
      exact: true,
    });
    await expectPopupFrame(configuration, viewport);
    await configuration
      .getByRole("button", { name: "Configura sulla pianta principale" })
      .click();
    await expect(configuration).toHaveCount(0);
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan
      .getByRole("button", { name: "Macchina", exact: true })
      .click();
    await pickPlanPoint(plan, 2, 2);
    await plan.getByTestId("draft-machine").click();
    const picker = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await expectPopupFrame(picker, viewport);
    await page.keyboard.press("Escape");
    await expect(plan.getByTestId("draft-machine")).toHaveCount(1);
    await plan.getByTestId("draft-machine").click();
    await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
    const models = picker
      .getByRole("region", { name: "Modelli macchina compatibili" })
      .getByRole("button");
    await models.last().click();
    const chosen = await models.last().locator("strong").innerText();
    await expect(
      picker
        .locator("footer")
        .getByRole("button", { name: "Salva", exact: true }),
    ).toBeInViewport();
    await picker.screenshot({ path: info.outputPath("machine-picker.png") });
    await picker
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await expect(models.filter({ hasText: chosen })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");
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
      name: /^(?:Vista |Configura impianto$)/,
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
      await openDisclosure(
        systems,
        "Configurazione da modulo e dettagli tecnici",
      );
      await expect(
        systems.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await systems.screenshot({
      path: info.outputPath("systems-rounded popup.png"),
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: /^(?:Vista |Configura impianto$)/,
        exact: true,
      }),
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

test("2D inspector routes machine editing to the plan popup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  const settings = page.getByRole("dialog", {
    name: /^(?:Vista |Configura impianto$)/,
  });
  await settings
    .getByRole("group", { name: "Impianto da configurare" })
    .getByRole("button", { name: "Canalizzato", exact: true })
    .click();
  await settings
    .getByRole("button", { name: "Apri planimetria operativa" })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Macchina", exact: true })
    .click();
  await pickPlanPoint(plan, 2, 2);
  await plan.getByTestId("draft-machine").click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  const models = picker
    .getByRole("region", { name: "Modelli macchina compatibili" })
    .getByRole("button");
  await models.filter({ hasText: "FBA50A9" }).click();
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await models.filter({ hasText: "FBA60A9" }).click();
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await expect(models.filter({ hasText: "FBA60A9" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
