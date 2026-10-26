import { expect, test } from "./browser-test";

test("DWG actual binary imports locally through HTTPS with MIT parser and no commercial ODA", async ({
  page,
  context,
}) => {
  const statusResponse = await context.request.get("/api/import/dwg");
  expect(statusResponse.ok()).toBe(true);
  const status = await statusResponse.json();
  expect(status.available).toBe(true);
  expect(status.engine).toBe("acadsharp");
  expect(status.license).toBe("MIT");
  expect(status.odaCommercialEnabled).toBe(false);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog
    .getByLabel("File planimetria", { exact: true })
    .setInputFiles("tests/fixtures/rectangular.dwg");
  await expect(
    dialog.getByText(/DWG AC1032 letto localmente con ACadSharp/),
  ).toBeVisible({ timeout: 30000 });
  await dialog.getByRole("checkbox", { name: /^MURI/ }).check();
  await dialog
    .getByRole("checkbox", {
      name: "Ho verificato la scala su una misura reale",
    })
    .check();
  await dialog
    .getByRole("checkbox", {
      name: /Le geometrie selezionate rappresentano assi muro/,
    })
    .check();
  await dialog
    .getByRole("button", { name: /^Importa muri selezionati/, exact: true })
    .click();
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await expect(page.locator(".nome-stanza")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /15,96 m²/ })).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(4);
  expect(errors).toEqual([]);
});
