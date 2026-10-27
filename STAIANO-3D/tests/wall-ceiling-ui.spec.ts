import { expect, test } from "./browser-test";
import { openInspector, pickPlanPoint } from "./ui-helpers";

test("controparete e controsoffitto: scelte rapide, rimozione e campi attivi solo quando servono", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await pickPlanPoint(page.locator("body"), 2.1, 0);
  const show = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await show.getAttribute("aria-expanded")) !== "true") await show.click();
  const drywall = page.getByTestId("drywall-properties");
  await drywall.locator("summary").click();
  await drywall.getByRole("button", { name: "10 cm", exact: true }).click();
  await expect(
    drywall.getByRole("spinbutton", { name: "Profondità del vuoto (cm)" }),
  ).toHaveValue("10");
  await drywall
    .getByRole("button", { name: "Applica lato stanza", exact: true })
    .click();
  const remove = drywall.getByRole("button", { name: "Rimuovi controparete" });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);

  await pickPlanPoint(page.locator("body"), 2.1, 1.9);
  await openInspector(page, "Modifica stanza");
  const height = page.getByRole("spinbutton", {
    name: "Quota controsoffitto",
    exact: true,
  });
  await expect(height).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Controsoffitto", exact: true })
    .check();
  await expect(height).toBeEnabled();
  const ceiling = page.getByTestId("ceiling-design");
  await ceiling.locator("summary").first().click();
  await expect(ceiling.getByLabel("Quota colmo (m)")).toBeDisabled();
  await ceiling.getByLabel("Tetto a due falde", { exact: true }).check();
  await expect(ceiling.getByLabel("Quota colmo (m)")).toBeEnabled();
});
