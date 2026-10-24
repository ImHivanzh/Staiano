import { expect, test } from "./browser-test";
import { openDisclosure, pickPlanPoint, openInspector } from "./ui-helpers";
import { exportPlenumFixture } from "./plenum-ui-fixture";

test("split reale: salva, ricarica e sincronizza selezione2D/3D", async ({
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
    .getByRole("combobox", { name: "Marca split", exact: true })
    .selectOption("Daikin");
  const selected = await popup
    .getByRole("combobox", { name: "Serie e modello split", exact: true })
    .inputValue();
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
  await expect(
    popup.getByRole("combobox", { name: "Serie e modello split", exact: true }),
  ).toHaveValue(selected);
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
