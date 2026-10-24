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

/** The FCZ is a hydronic terminal and a ducted air handler at the same time. */
test("la FCZ canalizzabile si collega alle bocchette dal piano", async ({
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
  await equipment.getByLabel("Marca ventilconvettore").selectOption("Aermec");
  await equipment
    .getByRole("combobox", { name: "Modello ventilconvettore", exact: true })
    .selectOption("FCZ PO");
  await equipment
    .getByRole("combobox", { name: "Taglia ventilconvettore", exact: true })
    .selectOption("aermec-fcz200po");
  await expect(
    equipment
      .getByRole("combobox", { name: "Modello ventilconvettore", exact: true })
      .locator("optgroup"),
  ).toHaveAttribute("label", "Ventilconvettori canalizzabili");
  await page.screenshot({ path: ".cache/fcz-categoria.png" });
  await equipment
    .getByRole("combobox", {
      name: "Velocità / punto di funzionamento",
      exact: true,
    })
    .selectOption("2");
  await equipment
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(equipment).toHaveCount(0);

  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 4, 2);
  await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);

  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("fan-coil-2d").click();
  await plan.getByTestId("draft-terminal").click();
  await expect(plan.getByTestId("pending-connection")).toHaveCount(1);
  await plan.screenshot({ path: ".cache/fcz-bocchette.png" });
  await page.keyboard.press("Escape");

  const result = await saved(page);
  const air = result.hvacSystems.find((system) => system.fanCoilId);
  expect(air, "la distribuzione aeraulica nasce dall'unità").toBeTruthy();
  expect(air!.fanCoilId).toBe(result.fanCoils![0].id);
  expect(air!.type).toBe("ducted");
  expect(air!.manufacturer).toBe("Aermec");
  expect(air!.airflowM3h).toBe(254);
  const terminal = result.ductedDrafts?.find(
    (item) => item.kind === "terminal",
  );
  expect(terminal?.machineId).toBe(air!.id);

  await page.reload();
  await expect(plan.getByTestId("pending-connection")).toHaveCount(1);
});
