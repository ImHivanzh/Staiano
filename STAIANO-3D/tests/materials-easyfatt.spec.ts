import { test, expect } from "./browser-test";
import { dossierFixture } from "../src/services/pdf/fixture";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "three/addons/libs/fflate.module.js";
import { openDisclosure } from "./ui-helpers";

test("Easyfatt exports every material grouped by room, including items without codes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles({
      name: "materiali.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(dossierFixture())),
    });
  await openDisclosure(page, "File");
  const prices = page.getByRole("checkbox", {
    name: "Includi prezzi di listino",
  });
  await expect(prices).not.toBeChecked();
  await prices.check();
  await expect(prices).toBeChecked();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "Materiali per Danea Easyfatt · Excel" })
      .click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const files = unzipSync(
    new Uint8Array(await readFile((await download.path())!)),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain("**STANZA: SOGGIORNO**");
  expect(sheet).toContain("**STANZA: CAMERA MATRIMONIALE**");
  const radiator = [
    ...sheet.matchAll(/<row r="(\d+)">([\s\S]*?)<\/row>/g),
  ].find(
    (entry) =>
      entry[2].includes("Cordivari") &&
      !entry[2].includes("Staffe") &&
      !entry[2].includes("Valvola") &&
      !entry[2].includes("Detentore") &&
      !entry[2].includes("Kit"),
  )!;
  expect(radiator).toBeDefined();
  expect(radiator[2]).toContain(`<c r="A${radiator[1]}"/>`);
});
