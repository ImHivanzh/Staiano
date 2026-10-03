import { expect, test } from "@playwright/test";
test("split reale: salva, ricarica e sincronizza selezione2D/3D", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page
    .getByLabel("Impianto da configurare", { exact: true })
    .selectOption("split");
  await page
    .getByRole("button", { name: "Configura climatizzazione", exact: true })
    .click();
  await expect(page.getByTestId("split-2d")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("split-2d")).toHaveCount(1);
  await page.getByTestId("split-2d").click();
  await expect(
    page.getByRole("button", { name: "Sposta split", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page
    .getByRole("button", { name: "Controlli", exact: false })
    .first()
    .click();
  await expect(page.locator(".controllo.invalid")).toHaveCount(0);
});
