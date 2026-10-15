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
    await page.keyboard.press("Escape");
    await expect(
      toolbar.getByRole("button", { name: "Seleziona", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "3D", exact: true }).click();
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
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    toolbar.getByRole("button", { name: "Pompa di calore", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
