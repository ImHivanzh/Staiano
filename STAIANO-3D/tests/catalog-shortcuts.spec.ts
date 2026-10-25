import { expect, test } from "./browser-test";

test("equipment shortcuts preserve inputs and work across 2D and 3D", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  const rectangle = page.getByRole("dialog");
  const name = rectangle.locator('input[name="name"]');
  await name.fill("camera");
  await name.press("b");
  await expect(name).toHaveValue("camerab");
  await rectangle
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const toolbar = page.getByRole("toolbar", {
    name: "Strumenti della planimetria",
  });
  for (const button of await toolbar
    .locator("button[aria-keyshortcuts]")
    .all()) {
    const key = await button.getAttribute("aria-keyshortcuts");
    await expect(button).toHaveAttribute(
      "title",
      new RegExp(String.raw`\(${key === "Space" ? "Spazio" : key}\)$`),
    );
  }
  for (const [key, label] of [
    ["c", "Collega"],
    ["p", "Pompa di calore"],
    ["s", "Split"],
    ["b", "Bocchetta"],
    ["v", "Ventilconvettore"],
  ]) {
    await page.locator("body").click({ position: { x: 2, y: 2 } });
    await page.keyboard.press(key);
    await expect(
      toolbar.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      toolbar.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute(
      "title",
      new RegExp(String.raw`\(${key.toUpperCase()}\)$`),
    );
    await page.keyboard.press("Escape");
    await expect(
      toolbar.getByRole("button", { name: "Seleziona", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  const position = async () =>
    (await canvas.getAttribute("data-camera-position"))!.split(",").map(Number);
  const travel = async (shift: boolean) => {
    const start = await position();
    if (shift) await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    // Measure continuous movement over a fixed time, including the released key state.
    await page.waitForTimeout(600);
    await page.keyboard.up("s");
    if (shift) await page.keyboard.up("Shift");
    const end = await position();
    return Math.hypot(...end.map((value, index) => value - start[index]));
  };
  const normal = await travel(false);
  expect(normal).toBeGreaterThan(0.15);
  expect(normal).toBeLessThan(0.8);
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const fast = await travel(true);
  expect(fast).toBeGreaterThan(normal * 2);
  expect(fast).toBeLessThan(normal * 6);
  const stopped = await position();
  await page.waitForTimeout(150);
  expect(await position()).toEqual(stopped);
  await page.keyboard.press("c");
  await expect(
    page.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("viewer-3d")
      .getByRole("button", { name: /Collega/ })
      .first(),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByTestId("viewer-3d")
      .getByRole("button", { name: /Collega/ })
      .first(),
  ).toHaveAttribute("title", "Collega macchina e bocchetta (C)");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    toolbar.getByRole("button", { name: "Pompa di calore", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
