import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

async function snapshot(page: Page) {
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, "utf8"));
}

test("applica lo spessore a tutti i muri mantenendo le quote interne", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const before = await snapshot(page);
  expect(before.rooms[0].netAreaM2).toBeCloseTo(4.2 * 3.8, 5);
  const previousMinX = Math.min(
    ...before.walls.flatMap((wall: { start: { x: number } }) => wall.start.x),
  );
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Impostazioni progetto e piani" })
    .click();
  await page
    .getByRole("group", { name: "Misura Spessore muri esterni", exact: true })
    .getByRole("combobox")
    .selectOption("mm");
  await page
    .getByRole("spinbutton", { name: "Spessore muri esterni (mm)" })
    .fill("400");
  await page
    .getByRole("button", { name: "Applica spessori a tutti i muri" })
    .click();
  await page.getByRole("button", { name: "Planimetria", exact: true }).click();
  const after = await snapshot(page);
  expect(
    after.walls.every((wall: { thickness: number }) => wall.thickness === 0.4),
  ).toBe(true);
  expect(after.rooms[0].netAreaM2).toBeCloseTo(before.rooms[0].netAreaM2, 5);
  const currentMinX = Math.min(
    ...after.walls.flatMap((wall: { start: { x: number } }) => wall.start.x),
  );
  expect(currentMinX).toBeCloseTo(previousMinX - 0.05, 5);
  await page.screenshot({
    path: info.outputPath("spessori-muri.png"),
    fullPage: true,
  });
});
