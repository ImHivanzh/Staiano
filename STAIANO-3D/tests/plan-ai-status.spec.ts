import { test, expect } from "./browser-test";

test("AI status distinguishes local model, missing advanced runtime and a successful explicit check", async ({
  page,
}, info) => {
  let checked = false;
  await page.route("**/api/import/reconstruct*", (route) => {
    checked = new URL(route.request().url()).searchParams.get("check") === "1";
    return route.fulfill({
      json: checked
        ? {
            available: true,
            state: "ready",
            message:
              "Ambiente AI pronto (CPU). Il modello viene caricato durante la ricostruzione.",
          }
        : {
            available: false,
            state: "unavailable",
            message: "Ricostruzione avanzata non configurata su questo server.",
          },
    });
  });
  await page.route("**/models/floorplan-unet.onnx", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.locator("summary").filter({ hasText: "Stato AI" }).click();
  await expect(dialog).toContainText("modello AI locale disponibile");
  await expect(dialog).toContainText("non configurata su questo server");
  await expect(dialog.locator("pre")).toContainText(
    "setup-plan-recognizer.ps1",
  );
  await expect(dialog).toContainText(
    "non occorre avviare un servizio Windows separato",
  );
  expect(checked).toBe(false);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    }),
  );
  await dialog
    .getByRole("button", { name: "Copia comando di attivazione" })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Seleziona e copia il comando qui sopra",
    }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Verifica AI", exact: true })
    .click();
  await expect(
    dialog.locator("summary").filter({ hasText: "Stato AI" }),
  ).toContainText("pronta");
  await expect(dialog.getByRole("status")).toContainText(
    "Ambiente AI pronto (CPU)",
  );
  expect(checked).toBe(true);
  await dialog.screenshot({ path: info.outputPath("stato-ai.png") });
});
