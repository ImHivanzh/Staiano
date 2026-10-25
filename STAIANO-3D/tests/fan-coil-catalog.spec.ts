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
  await popup.getByLabel("Marca ventilconvettore").selectOption("Aermec");
  const models = popup.getByRole("combobox", {
    name: "Modello ventilconvettore",
    exact: true,
  });
  await expect(models.locator("option")).toHaveCount(4);
  await expect(
    models.locator('optgroup[label="Ventilconvettori canalizzabili"] option'),
  ).toHaveCount(3);
  await expect(
    models.locator('optgroup[label="Ventilconvettori a parete e a soffitto"]'),
  ).toHaveCount(0);
  await models.selectOption("FCZ P");
  const sizes = popup.getByRole("combobox", {
    name: "Taglia ventilconvettore",
    exact: true,
  });
  await expect(sizes.locator("option")).toHaveCount(27);
  await sizes.selectOption("aermec-fcz200p");
  await expect(
    popup
      .getByRole("combobox", {
        name: "Velocità / punto di funzionamento",
        exact: true,
      })
      .locator("option"),
  ).toHaveText([/Bassa.*0,89.*1/, /Media.*1,28.*1,46/, /Alta.*1,6.*1,84/]);
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
  await models.selectOption("FCZ PO");
  await expect(cover).toHaveCount(0);
  await sizes.selectOption("aermec-fcz201po");
  await expect(sizes).toHaveValue("aermec-fcz201po");
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
  await popup.getByLabel("Marca ventilconvettore").selectOption("Aermec");
  await popup
    .getByRole("combobox", { name: "Modello ventilconvettore", exact: true })
    .selectOption("FCZ P");
  await popup
    .getByRole("combobox", { name: "Taglia ventilconvettore", exact: true })
    .selectOption("aermec-fcz200p");
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
  await popup.getByLabel("Marca ventilconvettore").selectOption("Aermec");
  await popup
    .getByRole("combobox", { name: "Modello ventilconvettore", exact: true })
    .selectOption("FCZ");
  const recommendation = popup.locator(
    '[aria-label="Ventilconvettore consigliato"]',
  );
  await expect(recommendation).toBeVisible();
  await expect(recommendation).toContainText("Taglia consigliata");
  const sizes = popup.getByRole("combobox", {
    name: "Taglia ventilconvettore",
    exact: true,
  });
  const value = await sizes.inputValue();
  expect(value).not.toBe("");
  await expect(sizes.locator(`option[value="${value}"]`)).toContainText(
    "consigliata",
  );
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
  await popup.getByLabel("Marca ventilconvettore").selectOption("Innova");
  await popup
    .getByRole("combobox", { name: "Modello ventilconvettore", exact: true })
    .selectOption("AirLeaf SL");
  await popup
    .getByRole("combobox", { name: "Taglia ventilconvettore", exact: true })
    .selectOption("innova-airleaf-sl-200-2t");
  const points = popup.getByRole("combobox", {
    name: "Velocità / punto di funzionamento",
    exact: true,
  });
  await expect(points.locator("option")).toHaveCount(1);
  await expect(points.locator("option")).toContainText("Massima · 0 Pa");
  await expect(points.locator("option")).toContainText("41,00 dB(A)");
  await expect(
    popup.getByText(/^Rumore non pubblicato per questo punto/),
  ).toHaveCount(0);
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
