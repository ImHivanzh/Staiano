import { expect, test } from "./browser-test";
import { PDFDocument, rgb } from "pdf-lib";

function cad() {
  const pairs: (string | number)[] = [
    0,
    "SECTION",
    2,
    "HEADER",
    9,
    "$INSUNITS",
    70,
    6,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
  ];
  for (const [layer, x, y, x2, y2] of [
    ["MURI", 0, 0, 4.3, 0],
    ["MURI", 4.3, 0, 4.3, 3.9],
    ["MURI", 4.3, 3.9, 0, 3.9],
    ["MURI", 0, 3.9, 0, 0],
    ["QUOTE", 5, 0, 5, 3.9],
  ])
    pairs.push(0, "LINE", 8, layer, 10, x, 20, y, 11, x2, 21, y2);
  pairs.push(0, "ENDSEC", 0, "EOF");
  return Buffer.from(pairs.join("\n") + "\n");
}
test("DXF locale: selezione layer, verifica scala, stanze nette e reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "quadrilocale.dxf",
    mimeType: "application/dxf",
    buffer: cad(),
  });
  await dialog.getByLabel("MURI (4)", { exact: true }).check();
  await dialog.getByLabel("Ho verificato la scala su una misura reale").check();
  await dialog
    .getByLabel(/Le geometrie selezionate rappresentano assi muro/)
    .check();
  await dialog
    .getByRole("button", { name: "Importa muri selezionati" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Ambiente 1 15,96 m²/ }),
  ).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Ambiente 1 15,96 m²/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/import-dxf.png",
    fullPage: true,
  });
});
test("PDF vettoriale locale: pagina, anteprima, due punti e sfondo calibrato", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([600, 500]);
  sheet.drawRectangle({
    x: 60,
    y: 80,
    width: 420,
    height: 320,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  });
  pdf.addPage([600, 500]);
  const buffer = Buffer.from(await pdf.save());
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "abitazione.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await expect(dialog.getByLabel("Pagina PDF", { exact: true })).toBeVisible();
  await expect(dialog.locator("svg line")).toHaveCount(4);
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  const box = await preview.boundingBox();
  if (!box) throw new Error("Anteprima non visibile");
  await preview.click({
    position: { x: box.width * 0.2, y: box.height * 0.5 },
  });
  await preview.click({
    position: { x: box.width * 0.7, y: box.height * 0.5 },
  });
  await dialog.getByLabel("Distanza reale di riferimento").fill("4,20");
  await dialog
    .getByRole("button", { name: "Calibra scala", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Importa sfondo calibrato" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ricalibra", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Ricalibra", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/import-pdf.png",
    fullPage: true,
  });
});
test.describe("invalid DWG request", () => {
  test.use({ expectedHttpError: { status: 400, path: "/api/import/dwg" } });
  test("DWG danneggiato non produce geometrie né modifica il progetto", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Importa planimetria/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
    const rejected = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/import/dwg" &&
        response.request().method() === "POST",
    );
    await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
      name: "abitazione.dwg",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("AC1027"),
    });
    expect((await rejected).status()).toBe(400);
    await expect(dialog.getByRole("alert")).toContainText("DWG valido");
    await expect(
      dialog.getByRole("button", { name: "Importa muri selezionati" }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Chiudi importazione" }).click();
    await expect(page.getByTestId("wall")).toHaveCount(0);
  });
});
