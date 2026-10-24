import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import type { Project } from "../src/schemas/project";

const coefficientName = "Coefficiente termico (W/m³)";
async function snapshot(page: Page): Promise<Project> {
  const waiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return JSON.parse(readFileSync((await (await waiting).path())!, "utf8"));
}

test("sceglie il coefficiente iniziale, ricalcola dalle impostazioni e lo conserva alla riapertura", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("spinbutton", { name: coefficientName, exact: true }),
  ).toHaveValue("37");
  await page
    .getByRole("spinbutton", { name: coefficientName, exact: true })
    .fill("42.75");
  await page.screenshot({ path: info.outputPath("start-coefficient.png") });
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const before = await snapshot(page);
  expect(before.projectSettings.coefficientWm3).toBe(42.75);
  expect(before.rooms[0].designLoadW).toBe(before.rooms[0].volumeM3 * 42.75);
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Impostazioni progetto e piani" })
    .click();
  await page
    .getByRole("spinbutton", { name: coefficientName, exact: true })
    .fill("55.25");
  await page.getByRole("button", { name: "Applica impostazioni" }).click();
  await page
    .getByTestId("save-status")
    .filter({ hasText: "Salvato" })
    .waitFor();
  const changed = await snapshot(page);
  expect(changed.projectSettings.coefficientWm3).toBe(55.25);
  expect(changed.rooms[0].designLoadW).toBe(before.rooms[0].volumeM3 * 55.25);
  expect(changed.walls).toEqual(before.walls);
  await page.reload();
  const reopened = await snapshot(page);
  expect(reopened.projectSettings.coefficientWm3).toBe(55.25);
  expect(reopened.rooms[0].designLoadW).toBe(changed.rooms[0].designLoadW);
});

test("il nuovo progetto consente di scegliere il coefficiente anche su tablet prima dell’importazione", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Nuovo", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Nuovo progetto",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "Nome progetto", exact: true })
    .fill("Importazione con coefficiente");
  await dialog
    .getByRole("spinbutton", { name: coefficientName, exact: true })
    .fill("48.5");
  await page.screenshot({
    path: info.outputPath("new-project-coefficient-tablet.png"),
  });
  await dialog
    .getByRole("button", { name: "Importa planimetria", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Chiudi/ })
    .first()
    .click();
  const project = await snapshot(page);
  expect(project.name).toBe("Importazione con coefficiente");
  expect(project.projectSettings.coefficientWm3).toBe(48.5);
});

test("rifiuta un coefficiente nullo e propone la scelta prima della procedura guidata", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("spinbutton", { name: coefficientName, exact: true })
    .fill("0");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await expect(
    page.getByText("Il coefficiente termico deve essere positivo e finito.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".inizio")).toBeVisible();
  await page.getByRole("button", { name: "Avvia wizard", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Nuovo progetto",
    exact: true,
  });
  await dialog
    .getByRole("spinbutton", { name: coefficientName, exact: true })
    .fill("50");
  await dialog
    .getByRole("button", { name: "Avvia procedura guidata", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Configurazione guidata" }),
  ).toBeVisible();
  expect((await snapshot(page)).projectSettings.coefficientWm3).toBe(50);
});
