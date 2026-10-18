import { test, expect } from "./browser-test";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openDisclosure } from "./ui-helpers";

test("dossier sintetico scaricato dal comando rapido: planimetrie A3 assenti e render incluso", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Scarica dossier sintetico PDF",
        exact: true,
      })
      .click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-dossier-sintetico\.pdf$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getTitle()).toContain("sintetico");
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);
  expect(
    pdf.getPages().some((p) => p.getWidth() > 900),
    "Il dossier sintetico non contiene le planimetrie A3, riservate al completo",
  ).toBe(false);
  const panorama = pdf
    .getPages()
    .find(
      (p) =>
        Math.abs(p.getWidth() - 841.89) < 0.1 &&
        Math.abs(p.getHeight() - 595.28) < 0.1,
    );
  expect(
    panorama,
    "Panoramica reale del progetto nel documento finale",
  ).toBeDefined();
  const images = panorama!.node
    .Resources()!
    .lookup(PDFName.of("XObject"), PDFDict);
  expect(images.values()).toHaveLength(1);
  const image = pdf.context.lookup(images.values()[0]);
  expect(image).toBeInstanceOf(PDFRawStream);
  if (!(image instanceof PDFRawStream))
    throw new Error("Immagine panorama mancante");
  expect(image.dict.get(PDFName.of("Filter"))).toEqual(PDFName.of("DCTDecode"));
  expect(image.contents.byteLength).toBeGreaterThan(20000);
  await mkdir("output/verification", { recursive: true });
  await download.saveAs("output/verification/render.pdf");
  await writeFile("output/verification/render-panorama.jpg", image.contents);
  await expect(page.locator('[data-staiano-render-export="true"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Scarica dossier sintetico PDF",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.locator(".errore-app[role='alert']")).toHaveCount(0);
});
test("render document cancellation releases the offscreen scene and creates no download", async ({
  page,
}) => {
  test.setTimeout(30000);
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.route("**/materials3d/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Dossier PDF", exact: true }).click();
  await expect(page.locator('[data-staiano-render-export="true"]')).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: "Annulla documento", exact: true })
    .click();
  await expect(page.locator('[data-staiano-render-export="true"]')).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Dossier PDF", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1000);
  expect(downloads).toEqual([]);
  await expect(page.locator(".errore-app[role='alert']")).toHaveCount(0);
});
