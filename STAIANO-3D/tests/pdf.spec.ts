import { test, expect } from "./browser-test";
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openDisclosure } from "./ui-helpers";

test("dossier sintetico scaricato dal comando rapido: planimetrie A3 e render inclusi", async ({
  page,
}, info) => {
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
    "Il dossier sintetico include le planimetrie A3",
  ).toBe(true);
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
  const renderDir = info.outputPath();
  await mkdir(renderDir, { recursive: true });
  await download.saveAs(info.outputPath("render.pdf"));
  await writeFile(info.outputPath("render-panorama.jpg"), image.contents);
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

test("dossier per stampa: bianco e nero selezionabile, render in grigio e sintetico con A3", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openDisclosure(page, "File");
  await page.getByLabel("Tipo dossier").selectOption("summary");
  await page.getByRole("checkbox", { name: "Stampa in bianco e nero" }).check();
  await page.screenshot({ path: info.outputPath("print-options-desktop.png") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Dossier PDF", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /-dossier-sintetico-bianco-nero\.pdf$/,
  );
  await download.saveAs(info.outputPath("dossier-bianco-nero.pdf"));
  const pdf = await PDFDocument.load(await readFile((await download.path())!));
  expect(pdf.getTitle()).toContain("bianco e nero");
  expect(pdf.getPages().some((sheet) => sheet.getWidth() > 900)).toBe(true);
  let images = 0;
  for (const sheet of pdf.getPages()) {
    const objects = sheet.node
      .Resources()
      ?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    for (const ref of objects?.values() ?? []) {
      const image = pdf.context.lookup(ref);
      if (!(image instanceof PDFRawStream)) continue;
      const data = `data:image/jpeg;base64,${Buffer.from(image.contents).toString("base64")}`;
      const result = await page.evaluate(async (url) => {
        const image = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data;
        image.close();
        let maxDifference = 0,
          min = 255,
          max = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          maxDifference = Math.max(
            maxDifference,
            Math.abs(pixels[i] - pixels[i + 1]),
            Math.abs(pixels[i + 1] - pixels[i + 2]),
          );
          min = Math.min(min, pixels[i]);
          max = Math.max(max, pixels[i]);
        }
        return { maxDifference, min, max };
      }, data);
      expect(result.maxDifference).toBeLessThanOrEqual(2);
      expect(result.max - result.min).toBeGreaterThan(100);
      images++;
    }
  }
  expect(images).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await openDisclosure(page, "File");
  await expect(
    page.getByRole("checkbox", { name: "Stampa in bianco e nero" }),
  ).toBeInViewport();
  await page.screenshot({ path: info.outputPath("print-options-ipad.png") });
});
