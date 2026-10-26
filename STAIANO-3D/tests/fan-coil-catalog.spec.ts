import { test, expect } from "./browser-test";
import { addRectangle, createProject } from "../src/domain/project";
import {
  fanCoilInstallationAccessories,
  fanCoilProductAtVersion,
} from "../src/domain/catalogs/fan-coils";
import { exportPlenumFixture } from "./plenum-ui-fixture";
import { pickPlanPoint, openDisclosure } from "./ui-helpers";

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
  await popup.getByRole("button", { name: "Aermec", exact: true }).click();
  await popup.getByRole("button", { name: "2 tubi", exact: true }).click();
  const models = popup.getByRole("group", { name: "Modello" });
  const fczP = models.getByRole("button", {
    name: /FCZ P Ventilconvettori canalizzabili/,
  });
  await expect(fczP).toBeVisible();
  await fczP.click();
  const sizes = popup.getByRole("group", { name: "Taglia" });
  await expect(sizes.getByRole("button")).toHaveCount(19);
  await sizes.getByRole("button", { name: /FCZ200P/ }).click();
  await expect(popup.getByText(/Alta · Parete · 2 tubi/)).toBeVisible();
  await expect(
    popup.locator("dl").getByText("1,60 kW", { exact: true }),
  ).toBeVisible();
  await expect(
    popup.locator("dl").getByText("1,84 kW", { exact: true }),
  ).toBeVisible();
  const cover = popup.getByLabel("Mobile di copertura Aermec");
  await expect(cover.locator("option")).toHaveText([
    "Senza mobile",
    "MZA200 · alette fisse",
    "MZU200 · alette orientabili",
  ]);
  await cover.selectOption("adjustable");
  await expect(cover).toHaveValue("adjustable");
  await expect(
    popup.getByText(/non è quotato nella fonte acquisita/),
  ).toBeVisible();
  await models
    .getByRole("button", { name: /FCZ PO Ventilconvettori canalizzabili/ })
    .click();
  await popup.getByRole("button", { name: "4 tubi", exact: true }).click();
  await models
    .getByRole("button", { name: /FCZ PO Ventilconvettori canalizzabili/ })
    .click();
  await expect(cover).toHaveCount(0);
  await sizes.getByRole("button", { name: /FCZ201PO/ }).click();
  await expect(popup.getByText(/Alta · 63 Pa/)).toBeVisible();
  await expect(
    popup.locator("dl").getByText("Non pubblicato", { exact: true }),
  ).toBeVisible();
});

test("MZU200 scelto sul FCZ P resta nel progetto e nella distinta", async ({
  page,
}) => {
  const project = createProject();
  const fixture = addRectangle(project, project.floors[0].id, {
    width: 8,
    length: 6,
    height: 2.7,
    name: "Salone",
  });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "fcz-mzu.hvacproj",
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
  await popup.getByRole("button", { name: "Aermec", exact: true }).click();
  await popup.getByRole("button", { name: "2 tubi", exact: true }).click();
  await popup
    .getByRole("group", { name: "Modello" })
    .getByRole("button", { name: /FCZ P Ventilconvettori canalizzabili/ })
    .click();
  await popup
    .getByRole("group", { name: "Taglia" })
    .getByRole("button", { name: /FCZ200P/ })
    .click();
  await popup
    .getByLabel("Mobile di copertura Aermec")
    .selectOption("adjustable");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  const saved = await exportPlenumFixture(page);
  expect(saved.fanCoils).toHaveLength(1);
  const unit = saved.fanCoils![0];
  expect(unit.coverType).toBe("adjustable");
  const product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  expect(product).not.toBeNull();
  expect(
    fanCoilInstallationAccessories(
      product!,
      unit.mounting,
      unit.panelType,
      unit.coverType,
    ).map((item) => item.code),
  ).toContain("MZU200");
});

test("dopo Marca e Modello il sistema consiglia la taglia", async ({
  page,
}) => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    name: "Camera",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "taglia.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  // Prima della scelta non esiste alcun consiglio di taglia.
  await expect(
    popup.locator('[aria-label="Ventilconvettore consigliato"]'),
  ).toHaveCount(0);
  await popup.getByRole("button", { name: "Aermec", exact: true }).click();
  await popup.getByRole("button", { name: "2 tubi", exact: true }).click();
  await popup
    .getByRole("group", { name: "Modello" })
    .getByRole("button", { name: /^FCZ Ventilconvettori canalizzabili/ })
    .click();
  const recommendation = popup.locator(
    '[aria-label="Ventilconvettore consigliato"]',
  );
  await expect(recommendation).toBeVisible();
  await expect(recommendation).toContainText("Taglia consigliata");
  const sizes = popup.getByRole("group", { name: "Taglia" });
  const recommendedSize = sizes.getByRole("button", {
    name: /Taglia consigliata/,
  });
  await expect(recommendedSize).toBeVisible();
  await expect(recommendedSize).toHaveAttribute("aria-pressed", "true");
});

test("AirLeaf shows the published maximum-speed pressure and its 2026 source", async ({
  page,
}) => {
  const empty = createProject();
  const project = addRectangle(empty, empty.floors[0].id, {
    width: 4,
    length: 4,
    height: 2.7,
    name: "Camera",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "airleaf.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("button", { name: "Ventilconvettore", exact: true })
    .click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-fanCoil").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup.getByRole("button", { name: "Innova", exact: true }).click();
  await popup.getByRole("button", { name: "2 tubi", exact: true }).click();
  await popup
    .getByRole("group", { name: "Modello" })
    .getByRole("button", {
      name: /^AirLeaf SL Ventilconvettori a parete e a soffitto/,
    })
    .click();
  await popup
    .getByRole("group", { name: "Taglia" })
    .getByRole("button", { name: /SL 200/ })
    .click();
  await expect(
    popup.getByText(/Massima · 0 Pa · Parete · 2 tubi/),
  ).toBeVisible();
  await expect(
    popup.getByRole("combobox", {
      name: "Velocità / punto di funzionamento",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    popup.locator("dl").getByText("41,00 dB(A)", { exact: true }),
  ).toBeVisible();
  await openDisclosure(popup, "Condizioni dei dati e fonte");
  await expect(
    popup.getByText(/Rumore: Pressione sonora alla massima portata/),
  ).toContainText("distanza 1 m");
  await expect(
    popup.getByRole("link", {
      name: "Scheda ufficiale Innova · pagina 40",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    /INNOVA_CATALOGO%20AIRLEAF_2026_260515170522\.pdf$/,
  );
});
