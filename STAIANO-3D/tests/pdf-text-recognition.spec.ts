import { test, expect } from "./browser-test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

test("PDF: testi grandi e ruotati restano nello sfondo senza diventare muri", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sheet = pdf.addPage([600, 450]);
  sheet.drawRectangle({
    x: 50,
    y: 50,
    width: 500,
    height: 350,
    borderWidth: 12,
    borderColor: rgb(0, 0, 0),
    color: rgb(1, 1, 1),
  });
  for (const y of [100, 180, 260])
    sheet.drawText("HHHH EEEE IIII", { x: 85, y, size: 44, font });
  sheet.drawText("HHHH", {
    x: 515,
    y: 100,
    size: 40,
    font,
    rotate: degrees(90),
  });
  // Text overlaps the wall: removing a text bounding box would erase wall ink.
  sheet.drawText("HHHH", { x: 150, y: 390, size: 44, font });

  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "testi-e-muri.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  const analysis = dialog.getByLabel("Analisi automatica planimetria");
  await expect(analysis).toContainText(
    "4 muri candidati · 0 ad alta affidabilità",
    { timeout: 20_000 },
  );
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  const textPixels = await preview.locator("image").evaluate(async (node) => {
    const image = new Image();
    image.src = node.getAttribute("href")!;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(170, 650, 120, 60).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 110) dark++;
    return dark;
  });
  expect(
    textPixels,
    "Testi originali conservati nell’anteprima",
  ).toBeGreaterThan(500);

  await dialog
    .getByRole("button", { name: "Seleziona area da riconoscere" })
    .click();
  await preview.scrollIntoViewIfNeeded();
  const corners = await preview.evaluate((node) => {
    const matrix = (node as SVGSVGElement).getScreenCTM()!;
    return [
      [200, 200],
      [900, 700],
    ].map(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  });
  for (const corner of corners) await page.mouse.click(corner.x, corner.y);
  await dialog
    .getByRole("button", { name: "Riconosci muri nell’area" })
    .click();
  await expect(analysis).toContainText("0 muri candidati", {
    timeout: 20_000,
  });
  await dialog.getByRole("button", { name: "Analizza pagina intera" }).click();
  await expect(analysis).toContainText(
    "4 muri candidati · 0 ad alta affidabilità",
    { timeout: 20_000 },
  );
});
