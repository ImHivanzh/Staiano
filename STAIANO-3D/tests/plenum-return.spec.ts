import { expect, test } from "./browser-test";
import { importPlenumFixture, exportPlenumFixture } from "./plenum-ui-fixture";

test("Collega associa il plenum alla ripresa macchina e Ruota 90 gradi li muove insieme", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const before = await importPlenumFixture(page);
  await page.getByRole("button", { name: "Collega", exact: true }).click();
  await page.getByTestId("plenum-2d").locator("rect").click();
  await page.getByTestId("split-2d").first().click();
  await expect(page.getByText(/Collegamento salvato/)).toBeVisible();
  await page
    .getByRole("button", { name: "Ruota 90°", exact: true })
    .first()
    .click();
  const result = await exportPlenumFixture(page);
  const machine = result.hvacSystems[0].indoorUnits[0];
  expect(result.plenums[0].use).toBe("return");
  expect(result.plenums[0].attachmentId).toBe(machine.id);
  expect(machine.rotation).toBeCloseTo(
    before.hvacSystems[0].indoorUnits[0].rotation + Math.PI / 2,
  );
  expect(result.plenums[0].rotation).toBeCloseTo(machine.rotation);
});
