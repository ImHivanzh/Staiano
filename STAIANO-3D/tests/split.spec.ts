import type { Locator } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

const sizeGroup = (popup: Locator) =>
  popup.getByRole("group", { name: "Taglia split", exact: true });
const pressedSplit = (popup: Locator) =>
  sizeGroup(popup).locator('[aria-pressed="true"]');
/** Marca → Modello → Taglia: apre i modelli finché la taglia cercata compare. */
async function pickSplit(popup: Locator, id: string) {
  const size = sizeGroup(popup).locator(`[data-id="${id}"]`);
  const models = popup
    .getByRole("group", { name: "Modello split", exact: true })
    .getByRole("button");
  for (let i = 0; i < (await models.count()) && !(await size.count()); i++)
    await models.nth(i).click();
  await size.click();
}

test("split reale: salva, ricarica e sincronizza selezione2D/3D", async ({
  page,
}) => {
  const splitAssets: number[] = [];
  page.on("response", (response) => {
    if (/\/models\/splits\/[^/]+\.glb$/.test(new URL(response.url()).pathname))
      splitAssets.push(response.status());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Disegna manualmente/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Split", exact: true }).click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-split").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup
    .getByRole("group", { name: "Marca split", exact: true })
    .getByRole("button", { name: "Daikin", exact: true })
    .click();
  const selected = (await pressedSplit(popup).getAttribute("data-id"))!;
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("split-2d")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const saved = await exportPlenumFixture(page);
  expect(saved.hvacSystems[0].productId).toBe(selected);
  const unit = saved.hvacSystems[0].indoorUnits[0];
  await page.reload();
  await expect(plan.getByTestId("split-2d")).toHaveCount(1);
  expect((await exportPlenumFixture(page)).hvacSystems).toEqual(
    saved.hvacSystems,
  );
  await plan.getByTestId("split-2d").click();
  await expect(pressedSplit(popup)).toHaveAttribute("data-id", selected);
  await popup
    .locator("footer")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(unit.id);
  const properties = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await properties.getAttribute("aria-expanded")) !== "true")
    await properties.click();
  await openInspector(page, "Posizione");
  await expect(
    page.getByRole("button", { name: "Sposta split", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await expect(canvas).toHaveAttribute("data-selection", unit.id);
  await expect.poll(() => splitAssets).toContain(200);
  await page
    .getByRole("button", { name: /^Controlli/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Controllo progetto", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Esito controlli").selectOption("all");
  await expect(page.locator(".controllo.valid").first()).toBeVisible();
  await page.getByLabel("Esito controlli").selectOption("invalid");
  await expect(page.locator(".controllo.invalid")).toHaveCount(0);
  await expect(
    page.getByText("Nessun controllo corrisponde ai filtri selezionati.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("LG Standard Plus a parete è configurabile e persiste", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Disegna manualmente/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Split", exact: true }).click();
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-split").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup
    .getByRole("group", { name: "Marca split", exact: true })
    .getByRole("button", { name: "LG", exact: true })
    .click();
  const wallCatalog = popup.getByText(/Catalogo LG a parete · 50 modelli/);
  await expect(wallCatalog).toBeVisible();
  await wallCatalog.click();
  await expect(popup.getByText(/Mirror · AM07BH\.NSJ/)).toBeVisible();
  await expect(popup.getByText(/Air Purification · AP09RT\.NSJ/)).toBeVisible();
  await expect(popup.getByText(/Deluxe · DC09RH\.NSJ/)).toBeVisible();
  await expect(popup.getByText(/Standard 2 · S09ET\.NSJ/)).toBeVisible();
  await expect(
    popup
      .getByRole("listitem")
      .filter({ hasText: /DUALCOOL AI Deluxe · H09S1DA/ }),
  ).toBeVisible();
  await pickSplit(popup, "lg-mu2r15-mj12-single");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("split-2d")).toHaveCount(1);
  const wallSaved = await exportPlenumFixture(page),
    wallSystem = wallSaved.hvacSystems[0];
  expect(wallSystem.manufacturer).toBe("LG");
  expect(wallSystem.productId).toBe("lg-mu2r15-mj12-single");
  expect(wallSystem.indoorUnits[0].mounting).toBe("wall");
  await expect(page.getByAltText(/LG Standard Plus/)).toBeVisible();
  await page.reload();
  await expect(plan.getByTestId("split-2d")).toHaveCount(1);
  expect((await exportPlenumFixture(page)).hvacSystems).toEqual(
    wallSaved.hvacSystems,
  );
  await plan.getByTestId("split-2d").click();
  await pickSplit(popup, "lg-h18s1da-mono");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  const monoSaved = await exportPlenumFixture(page);
  expect(monoSaved.hvacSystems[0].productId).toBe("lg-h18s1da-mono");
  expect(monoSaved.hvacSystems[0].outdoorUnit).toMatchObject({
    widthMm: 770,
    heightMm: 545,
    depthMm: 288,
  });
});

test("LG Round Cassette resta circolare in pianta dopo il reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Disegna manualmente/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Split", exact: true }).click();
  await pickPlanPoint(plan, 2.1, 1.9);
  await plan.getByTestId("draft-split").click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await popup
    .getByRole("group", { name: "Marca split", exact: true })
    .getByRole("button", { name: "LG", exact: true })
    .click();
  await pickSplit(popup, "lg-round-ut36f-uud1-u30-mono");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();

  await expect(plan.getByTestId("split-cassette-circle")).toHaveCount(1);
  const saved = await exportPlenumFixture(page),
    system = saved.hvacSystems[0],
    unit = system.indoorUnits[0];
  expect(system.manufacturer).toBe("LG");
  expect(unit).toMatchObject({
    productId: "lg-round-cassette-ut36f-ny0",
    mounting: "ceiling",
    wallId: null,
  });
  await expect(page.getByAltText(/LG Round Cassette UT36F/)).toBeVisible();

  await page.reload();
  await expect(plan.getByTestId("split-cassette-circle")).toHaveCount(1);
  expect((await exportPlenumFixture(page)).hvacSystems).toEqual(
    saved.hvacSystems,
  );
});
