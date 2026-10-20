import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

async function saved(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await downloaded).path())!, "utf8")),
  );
}

test("con due macchine nello stesso ambiente la taglia consigliata è per macchina", async ({
  page,
}) => {
  test.setTimeout(180000);
  const raw = structuredClone(
    JSON.parse(readFileSync(".cache/guided-ui-fixtures.json", "utf8")).empty,
  );
  raw.hvacSystems = [];
  raw.airTerminals = [];
  raw.plenums = [];
  raw.ducts = [];
  raw.installations = [];
  raw.rooms[0].systemType = "none";
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "due-macchine.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await page
    .getByRole("button", { name: "Chiudi wizard", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();

  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 4, 2);
  await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 4);
  await expect(plan.getByTestId("draft-machine")).toHaveCount(1);
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 6, 4);
  await expect(plan.getByTestId("draft-machine")).toHaveCount(2);

  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("draft-machine").first().click();
  await plan.getByTestId("draft-terminal").click();
  await page.keyboard.press("Escape");

  await plan.getByTestId("draft-machine").first().click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await expect(picker).toBeVisible();
  await expect(picker).toContainText(/diviso fra 2 macchine/i);
  await expect(picker).toContainText(/fabbisogno per macchina/i);
  await page.screenshot({ path: ".cache/due-macchine.png" });
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(picker).toHaveCount(0);

  const result = await saved(page);
  const ducted = result.hvacSystems.filter((system) => !system.fanCoilId);
  expect(ducted).toHaveLength(1);
  const added = ducted[0];
  expect(added.plannedMachines).toBe(2);
  expect(added.capacityW).toBeLessThan(result.rooms[0].designLoadW);
});
