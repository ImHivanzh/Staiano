import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";

const project = readFileSync("tests/fixtures/radiator-wizard.hvacproj", "utf8");

test("the guided wizard recognizes a radiator system at the plant step", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "radiator-wizard.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(project),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(1);
  const wizard = page.getByRole("region", { name: "Configurazione guidata" });
  await expect(wizard).toContainText("Passo 4 di 5");
  await expect(wizard).toContainText("Camera");
  await expect(wizard).toContainText("1 radiatore");
  await expect(wizard).not.toContainText("Nessuna macchina inserita");
  await wizard
    .getByRole("button", { name: "Inserisci radiatore sulla pianta" })
    .click();
  await expect(
    page.getByText("Clicca per inserire l’apparecchio. Escape annulla."),
  ).toBeVisible();
  await wizard.getByRole("button", { name: "Conferma e continua" }).click();
  await expect(wizard).toContainText("Passo 5 di 5");
});
