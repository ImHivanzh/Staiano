import { test, expect } from "./browser-test";
import { addRectangle, createProject } from "../src/domain/project";
import { pickPlanPoint } from "./ui-helpers";

test("FCZ P e PO sono selezionabili con prestazioni e prevalenza distinte", async ({
  page,
}) => {
  const project = createProject();
  const fixture = addRectangle(project, project.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "fcz.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 3, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup.getByLabel("Marca ventilconvettore").selectOption("Aermec");
  const models = popup.getByRole("combobox", {
    name: "Serie e modello",
    exact: true,
  });
  await expect(models.locator("option")).toHaveCount(66);
  await models.selectOption("aermec-fcz200p");
  await expect(
    popup
      .getByRole("combobox", {
        name: "Velocità / punto di funzionamento",
        exact: true,
      })
      .locator("option"),
  ).toHaveText([/Bassa.*0,89.*1/, /Media.*1,28.*1,46/, /Alta.*1,6.*1,84/]);
  await models.selectOption("aermec-fcz201po");
  await expect(models).toHaveValue("aermec-fcz201po");
  await expect(
    popup
      .getByRole("combobox", {
        name: "Velocità / punto di funzionamento",
        exact: true,
      })
      .locator("option")
      .nth(1),
  ).toContainText("50 Pa");
  await expect(
    popup.getByText(/^Rumore non pubblicato per questo punto/),
  ).toBeVisible();
});
