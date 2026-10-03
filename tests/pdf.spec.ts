import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

test("dossier PDF locale scaricato con logo, planimetria e schede stanza", async ({
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
    page.getByRole("button", { name: "Dossier PDF", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-dossier-tecnico\.pdf$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = await PDFDocument.load(await readFile(path!));
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(8);
  expect(pdf.getPages().some((p) => p.getWidth() > 1100)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Dossier PDF", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".errore-app[role='alert']")).toHaveCount(0);
});
