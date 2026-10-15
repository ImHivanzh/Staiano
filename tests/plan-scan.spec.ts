import { expect, test } from "./browser-test";
import { PDFDocument, rgb } from "pdf-lib";

test("Pantum: scansione PDF nel flusso di anteprima e calibrazione", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf
    .addPage([600, 500])
    .drawRectangle({
      x: 60,
      y: 80,
      width: 420,
      height: 320,
      borderColor: rgb(0, 0, 0),
      borderWidth: 2,
    });
  const body = Buffer.from(await pdf.save());
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/import/scan", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      dpi: 300,
      sorgente: "piano",
    });
    await waiting;
    await route.fulfill({ contentType: "application/pdf", body });
  });
  await page.goto("/");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("Sorgente scansione").selectOption("piano");
  await dialog.getByLabel("Risoluzione scansione").selectOption("300");
  await dialog.getByRole("button", { name: "Scansiona planimetria" }).click();
  await expect(
    dialog.getByRole("button", { name: "Scansione in corso…" }),
  ).toBeDisabled();
  await expect(
    dialog.getByLabel("File planimetria", { exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    dialog.getByText("Planimetria-scansionata.pdf", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel(
      "Anteprima planimetria; seleziona due punti per la scala",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Scansiona planimetria" }),
  ).toBeEnabled();
  await page.screenshot({ path: "test-results/plan-scan-desktop.png" });
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(dialog.getByLabel("Sorgente scansione")).toBeVisible();
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/plan-scan-ipad.png" });
});

test.describe("errore scanner", () => {
  test.use({ expectedHttpError: { status: 409, path: "/api/import/scan" } });
  test("mostra l'errore e permette di riprovare", async ({ page }) => {
    await page.route("**/api/import/scan", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ message: "Scanner occupato" }),
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: /^Importa planimetria/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
    await dialog.getByRole("button", { name: "Scansiona planimetria" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Scanner occupato");
    await expect(
      dialog.getByRole("button", { name: "Scansiona planimetria" }),
    ).toBeEnabled();
    await expect(
      dialog.getByLabel("File planimetria", { exact: true }),
    ).toBeEnabled();
  });
});
