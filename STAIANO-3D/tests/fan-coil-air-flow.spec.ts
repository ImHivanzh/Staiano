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

/** A supply fan-coil outlet must have its own plenum before connection. */
test("la FCZ non si collega alla bocchetta di mandata senza plenum", async ({
  page,
}) => {
  test.setTimeout(180000);
  const fixture = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).empty;
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "fcz-aria.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Chiudi wizard", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();

  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 3, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const equipment = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await equipment.getByRole("button", { name: "Aermec", exact: true }).click();
  await equipment.getByRole("button", { name: "2 tubi", exact: true }).click();
  const models = equipment.getByRole("group", { name: "Modello" });
  await models
    .getByRole("button", { name: /FCZ PO Ventilconvettori canalizzabili/ })
    .click();
  await equipment
    .getByRole("group", { name: "Taglia" })
    .getByRole("button", { name: /FCZ200PO/ })
    .click();
  await page.screenshot({ path: ".cache/fcz-categoria.png" });
  await equipment
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(equipment).toHaveCount(0);

  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 4, 2);
  await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);

  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("fan-coil-2d").locator("rect").first().click();
  await expect(
    page.getByText(
      "Configura la bocchetta e il suo plenum prima del collegamento.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(plan.getByTestId("pending-connection")).toHaveCount(0);

  const result = await saved(page);
  const air = result.hvacSystems.find((system) => system.fanCoilId);
  expect(air).toBeUndefined();
  expect(
    result.ductedDrafts?.find((item) => item.kind === "terminal")?.machineId,
  ).toBeUndefined();
});
