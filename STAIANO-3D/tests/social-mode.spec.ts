import { expect, test } from "./browser-test";
import { statSync } from "node:fs";

test("modalità social: colonna 9:16 con logo, orbita automatica e video scaricabile", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles("tests/fixtures/realistic-home.hvacproj");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Apri vista cliente", exact: true })
    .click();
  const client = await opened;
  await client.setViewportSize({ width: 1600, height: 900 });
  await client.getByRole("button", { name: "Social", exact: true }).click();
  const main = client.locator("main[data-social]");
  const box = (await main.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2);
  await expect(
    client.getByRole("img", { name: "Termoidraulica Staiano" }),
  ).toBeVisible();
  await expect(
    client.getByRole("navigation", { name: "Comandi presentazione" }),
  ).toHaveCount(0);
  // Orbita: due fotogrammi a distanza di tempo devono differire.
  const canvas = client.locator("canvas");
  const first = await canvas.screenshot();
  await client.waitForTimeout(1500);
  const second = await canvas.screenshot();
  expect(Buffer.compare(first, second)).not.toBe(0);
  await client.screenshot({ path: info.outputPath("social.png") });

  const download = client.waitForEvent("download", { timeout: 240000 });
  await client.getByRole("button", { name: /Registra video/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("video-staiano.mp4");
  const path = info.outputPath(file.suggestedFilename());
  await file.saveAs(path);
  expect(statSync(path).size).toBeGreaterThan(50_000);

  await client.keyboard.press("Escape");
  await expect(client.locator("main[data-social]")).toHaveCount(0);
  await expect(
    client.getByRole("navigation", { name: "Comandi presentazione" }),
  ).toBeVisible();
});
