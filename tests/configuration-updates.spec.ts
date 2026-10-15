import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

async function start(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();
  return plan;
}

async function snapshot(page: Page) {
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

test("manual kW become persisted W and reopen as kW", async ({ page }) => {
  const plan = await start(page);
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 2);
  await plan.getByTestId("draft-machine").click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByRole("button", { name: "Dati manuali" }).click();
  await picker.getByLabel("Marca macchina manuale").fill("Daikin");
  await picker.getByLabel("Modello macchina manuale").fill("Manuale kW");
  await picker.getByLabel("Portata massima macchina manuale").fill("900");
  for (const [name, value] of [
    ["width", "900"],
    ["height", "250"],
    ["depth", "700"],
    ["cooling", "5.2"],
    ["heating", "6.4"],
  ]) {
    await picker.locator(`input[name="${name}"]`).fill(value);
  }
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(picker).toBeHidden();
  expect((await snapshot(page)).hvacSystems[0].genericMachine).toMatchObject({
    coolingCapacityW: 5200,
    heatingCapacityW: 6400,
  });
  await page.reload();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await expect(picker.locator('input[name="cooling"]')).toHaveValue("5.2");
  await expect(picker.locator('input[name="heating"]')).toHaveValue("6.4");
});

test("second ducted placement defaults to previous project manufacturer", async ({
  page,
}) => {
  const plan = await start(page);
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 2);
  await plan.getByTestId("draft-machine").click();
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(picker).toBeHidden();
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 3.5, 3);
  await plan.getByTestId("draft-machine").click();
  await expect(picker.getByLabel("Marca canalizzato")).toHaveValue("Daikin");
  await expect(picker.getByRole("checkbox")).toHaveCount(0);
});

test("configured pump keeps configuration and data in one popup", async ({
  page,
}) => {
  const plan = await start(page);
  await plan
    .getByRole("button", { name: "Pompa di calore", exact: true })
    .click();
  await pickPlanPoint(plan, 5.7, 2);
  await plan.getByTestId("draft-heatPump").click();
  const picker = page.getByRole("dialog", { name: "Scegli pompa di calore" });
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(picker).toBeHidden();
  await plan.getByTestId("heat-pump-2d").click();
  await expect(
    picker.getByRole("button", { name: "Configurazione", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
  await picker
    .getByRole("button", { name: "Dati impianto", exact: true })
    .click();
  await expect(picker.getByRole("table")).toContainText("Ingombro L × P × H");
  await expect(picker.getByLabel("Marca pompa di calore")).toBeHidden();
  await picker
    .getByRole("button", { name: "Configurazione", exact: true })
    .click();
  await expect(picker.getByLabel("Marca pompa di calore")).toBeVisible();
});
