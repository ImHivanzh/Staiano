import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("project downloads an archive of original technical sheets and their index", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles("tests/fixtures/realistic-home.hvacproj");
  await openDisclosure(page, "File");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Scarica schede tecniche", exact: true })
    .click();
  const download = await downloading;
  await download.saveAs("output/verification/installed-technical-sheets.zip");
  expect(download.suggestedFilename()).toMatch(/-schede-tecniche\.zip$/);
  const archive = readFileSync((await download.path())!);
  expect(archive.readUInt32LE(0)).toBe(0x04034b50);
  const nameLength = archive.readUInt16LE(26);
  expect(archive.subarray(30, 30 + nameLength).toString()).toBe(
    "INDICE-schede-tecniche.txt",
  );
  expect(archive.toString()).toContain("SHA256:");
  await expect(page.getByText(/documenti scaricati\./)).toBeVisible();
});
