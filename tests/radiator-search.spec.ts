import { expect, test } from "@playwright/test";

test("exact radiator worker can be cancelled and restarted without applying provisional results", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page
    .getByLabel("Marca radiatori", { exact: true })
    .selectOption("Cordivari");
  await page
    .getByLabel("Famiglia radiatori", { exact: true })
    .selectOption("Ardesia 4 colonne");
  await page.getByLabel("Numero radiatori", { exact: true }).fill("10");
  await page.getByLabel("ΔT progetto (K)", { exact: true }).fill("40");
  await page
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  await expect(
    page.getByText("Ricerca completa in corso.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Applica e posiziona", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Annulla ricerca", exact: true })
    .click();
  await expect(
    page.getByText("Ricerca completa in corso.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByTestId("radiator-2d")).toHaveCount(0);
  await page
    .getByLabel("Marca radiatori", { exact: true })
    .selectOption("Global");
  await page
    .getByLabel("Famiglia radiatori", { exact: true })
    .selectOption("VIP");
  await page.getByLabel("Numero radiatori", { exact: true }).fill("3");
  await page.getByLabel("ΔT progetto (K)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  const result = page.locator(".soluzione-radiatore").first();
  await expect(result).toContainText("3 radiatori");
  await expect(
    result.getByRole("button", { name: "Applica e posiziona", exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});
