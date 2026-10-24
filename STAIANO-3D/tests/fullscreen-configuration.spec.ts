import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

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

async function connectedMachine(page: Page) {
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "popup.hvacproj",
    mimeType: "application/json",
    buffer: readFileSync("tests/fixtures/unconfigured-connections.json"),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("draft-machine").click();
  await plan.getByTestId("draft-terminal").click();
  await page.keyboard.press("Escape");
  await plan.getByTestId("draft-machine").click();
  return plan;
}
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`machine choice fits the main-plan popup at ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const plan = await connectedMachine(page);
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
  });
  test(`project popups fit PC and iPad at ${viewport.width}`, async ({
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
    );
    await openDisclosure(page, "File");
    await page
      .getByRole("button", { name: "Listino materiali", exact: true })
      .click();
    const bill = page.getByRole("dialog", {
      name: "Listino materiali Ecoclima",
    });
    await expectPopupFrame(bill, viewport);
    await page.keyboard.press("Escape");
    await openDisclosure(page, "File");
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
    const importer = page.getByRole("dialog", { name: "Importa planimetria" });
    await expectPopupFrame(importer, viewport);
    await expect(importer.getByLabel("File planimetria")).toBeVisible();
    await importer.screenshot({ path: info.outputPath("import-popup.png") });
    await page.keyboard.press("Escape");
    await expect(importer).toHaveCount(0);
  });
}
