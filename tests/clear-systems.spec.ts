import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("Cancella impianto confirms, preserves the plan, supports undo and survives reload", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles("tests/fixtures/realistic-home.hvacproj");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  async function exported() {
    await openDisclosure(page, "File");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    return JSON.parse(readFileSync((await (await download).path())!, "utf8"));
  }
  const before = await exported();
  await openDisclosure(page, "Modifica");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Cancella impianto", exact: true })
    .click();
  expect((await exported()).hvacSystems).toEqual(before.hvacSystems);
  await openDisclosure(page, "Modifica");
  await page.screenshot({ path: info.outputPath("clear-systems-menu.png") });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("tutti i piani");
    await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Cancella impianto", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const cleared = await exported();
  for (const key of [
    "hvacSystems",
    "hydronicSystems",
    "radiators",
    "fanCoils",
    "airTerminals",
    "plenums",
    "ducts",
  ])
    expect(cleared[key] ?? []).toEqual([]);
  for (const key of [
    "id",
    "name",
    "walls",
    "openings",
    "pillars",
    "sourceFilesMetadata",
    "projectSettings",
  ])
    expect(cleared[key]).toEqual(before[key]);
  expect(cleared.rooms).toEqual(
    before.rooms.map((room: Record<string, unknown>) => ({
      ...room,
      systemType: "none",
      supplyPoints: 1,
      returnPoints: 1,
    })),
  );
  await page.keyboard.press("Control+z");
  expect((await exported()).hvacSystems).toEqual(before.hvacSystems);
  await page.keyboard.press("Control+y");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  expect((await exported()).hvacSystems).toEqual([]);
});
