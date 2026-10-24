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
    .fill("600");
  await page
    .getByRole("button", { name: "Applica spessori a tutti i muri" })
    .click();
  await page.getByRole("button", { name: "Planimetria", exact: true }).click();
  const after = await snapshot(page);
  expect(
    after.walls.every((wall: { thickness: number }) => wall.thickness === 0.6),
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

test("applica lo spessore ai soli muri esterni", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "muri-esterni.hvacproj",
    mimeType: "application/json",
    buffer: readFileSync("tests/fixtures/realistic-home.hvacproj"),
  });
  const before = await snapshot(page);
  const internal = before.walls.filter(
    (wall: { type: string }) => wall.type === "INTERNO",
  );
  expect(internal.length).toBeGreaterThan(0);
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
    .fill("500");
  await page
    .getByRole("button", { name: "Applica spessore ai soli muri esterni" })
    .click();
  const after = await snapshot(page);
  expect(
    after.walls
      .filter((wall: { type: string }) => wall.type === "ESTERNO")
      .every((wall: { thickness: number }) => wall.thickness === 0.5),
  ).toBe(true);
  const changedInternal = after.walls.filter(
    (wall: { type: string }) => wall.type === "INTERNO",
  );
  expect(changedInternal).toHaveLength(internal.length);
  for (const wall of internal) {
    const changed = changedInternal.find(
      (item: { id: string }) => item.id === wall.id,
    );
    expect(changed.thickness).toBe(wall.thickness);
  }
  for (const room of before.rooms) {
    const changed = after.rooms.find(
      (item: { id: string }) => item.id === room.id,
    );
    expect(changed.netAreaM2).toBeCloseTo(room.netAreaM2, 6);
  }
});
