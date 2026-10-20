import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { execFileSync } from "node:child_process";
import type { Project } from "../src/schemas/project";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { mkdir, readFile } from "node:fs/promises";
function pdfQaFixture(): Project {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        "import {pdfQaFixture} from './scripts/verification/pdf-fixture.ts';console.log(JSON.stringify(pdfQaFixture()));",
      ],
      { encoding: "utf8" },
    ),
  );
}

test("complete and summary dossiers always include the real 3D render and identify plenum machines", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  const project = pdfQaFixture();
  await page.getByTestId("project-file").setInputFiles({
    name: "dossier-qa.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(4);
  await mkdir("output/pdf", { recursive: true });
  for (const variant of ["complete", "summary"] as const) {
    await openDisclosure(page, "File");
    await expect(
      page.getByRole("checkbox", { name: "Includi render 3D" }),
    ).toHaveCount(0);
    await page
      .getByLabel("Tipo dossier", { exact: true })
      .selectOption(variant);
    const downloaded = page.waitForEvent("download", { timeout: 60000 });
    await page
      .getByRole("button", { name: "Dossier PDF", exact: true })
      .click();
    const download = await downloaded;
    const bytes = await readFile((await download.path())!);
    const pdf = await PDFDocument.load(bytes);
    const renders = pdf
      .getPages()
      .filter(
        (p) =>
          Math.abs(p.getWidth() - 841.89) < 0.1 &&
          Math.abs(p.getHeight() - 595.28) < 0.1,
      );
    expect(renders.length).toBeGreaterThan(0);
    for (const render of renders)
      expect(
        render.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).values()
          .length,
      ).toBeGreaterThan(0);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes) }),
      document = await task.promise;
    const texts: string[] = [];
    for (let i = 1; i <= document.numPages; i++)
      texts.push(
        (await (await document.getPage(i)).getTextContent()).items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    expect(texts.join(" ")).toContain("Mitsubishi Electric");
    expect(texts.join(" ")).toContain("Daikin");
    expect(texts.join(" ")).not.toMatch(/\bMACCHINA\b/);
    await task.destroy();
    await download.saveAs(
      `output/pdf/staiano-guided-dossier${variant === "summary" ? "-sintetico" : ""}.pdf`,
    );
  }
});

test("operator downloads a native SKP with the imported plan, architecture and devices", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/");
  const project = pdfQaFixture();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 100;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "white";
    c.fillRect(0, 0, 200, 100);
    c.strokeRect(2, 2, 196, 96);
    return canvas.toDataURL("image/png");
  });
  project.floors[0].background = {
    dataUrl,
    widthPx: 200,
    heightPx: 100,
    metersPerPixel: 0.1,
    origin: { x: 0, y: 0 },
    opacity: 1,
    filename: "planimetria-qa.png",
  };
  await page.getByTestId("project-file").setInputFiles({
    name: "modello-qa.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(4);
  await openDisclosure(page, "File");
  const downloaded = page.waitForEvent("download", { timeout: 120000 });
  await page
    .getByRole("button", { name: "Scarica modello SKP", exact: true })
    .click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.skp$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.length).toBeGreaterThan(5000);
  await mkdir("output/verification", { recursive: true });
  await download.saveAs("output/verification/staiano-modello.skp");
  await expect(page.locator("[data-staiano-skp-export]")).toHaveCount(0);
  await expect(page.locator('.notifica-toast[data-tone="error"]')).toHaveCount(
    0,
  );
});
