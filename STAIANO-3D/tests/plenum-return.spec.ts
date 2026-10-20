import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

async function saved(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await downloaded).path())!, "utf8")),
  );
}

/** In un canalizzato servono due plenum: uno di mandata e uno di ripresa. */
test("dalla macchina si crea anche il plenum di ripresa", async ({ page }) => {
  test.setTimeout(120000);
  const project = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).network;
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "due-plenum.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  await page.getByTestId("split-2d").first().click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker
    .getByRole("button", { name: "Vista plenum", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Vista plenum",
    exact: true,
  });
  const panel = dialog.getByRole("region", { name: "Plenum di mandata" });
  await expect(panel).toBeVisible();

  await panel
    .getByRole("button", { name: "Plenum di ripresa", exact: true })
    .click();
  const returned = dialog.getByRole("region", { name: "Plenum di ripresa" });
  await expect(returned).toBeVisible();
  await returned.getByLabel("Larghezza attacco ripresa (mm)").fill("600");
  await returned.getByLabel("Altezza attacco ripresa (mm)").fill("250");
  await returned
    .getByRole("button", { name: "Salva attacco di ripresa", exact: true })
    .click();
  await page.screenshot({ path: ".cache/plenum-ripresa.png" });
  await returned
    .getByRole("button", {
      name: "Crea plenum di ripresa nel progetto",
      exact: true,
    })
    .click();
  // Dopo la creazione i pannelli si chiudono e si vede il plenum in pianta.
  await expect(dialog).toHaveCount(0);
  await expect(picker).toHaveCount(0);

  const result = await saved(page);
  const uses = result.plenums.map((plenum) => plenum.use).sort();
  expect(uses).toEqual(["return", "supply"]);
  const returnPlenum = result.plenums.find(
    (plenum) => plenum.use === "return",
  )!;
  expect(returnPlenum.widthMm).toBe(600);
  expect(returnPlenum.heightMm).toBe(250);
  expect(returnPlenum.systemId).toBe(result.hvacSystems[0].id);
});
