import { test, expect } from "./browser-test";
import { importPlenumFixture } from "./plenum-ui-fixture";
import { chooseTerminalModel, terminalLengthButton } from "./ui-helpers";

test("changing the slot configuration applies the new recommendation instead of the previous manual length", async ({
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importPlenumFixture(page);
  await page
    .getByTestId("terminal-supply")
    .first()
    .locator("rect")
    .first()
    .click();
  const popup = page.getByRole("dialog", {
    name: "Configura bocchetta",
  });
  await expect(popup).toBeVisible();
  await popup
    .getByRole("button", { name: "Cambia modello bocchetta", exact: true })
    .click();
  await chooseTerminalModel(popup, "EDFL-20");
  await expect(
    popup.getByRole("heading", { name: "Modello · EDFL-20" }),
  ).toBeVisible();
  const slots = popup.getByRole("group", {
    name: "Numero di feritoie",
    exact: true,
  });
  await slots.getByRole("button", { name: "2 feritoie", exact: true }).click();
  const recommended = async () => {
    const text = await popup
      .getByLabel("Misura consigliata", { exact: true })
      .innerText();
    const match = text.match(/da\s+([\d.,]+)\s*mm/);
    expect(match).not.toBeNull();
    return Number(match![1].replace(/\./g, "").replace(",", "."));
  };
  const expected = await recommended();
  await slots.getByRole("button", { name: "3 feritoie", exact: true }).click();
  const manual = expected === 600 ? 2000 : 600;
  await terminalLengthButton(popup, manual).click();
  await slots.getByRole("button", { name: "2 feritoie", exact: true }).click();
  await expect(terminalLengthButton(popup, expected)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(terminalLengthButton(popup, manual)).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
