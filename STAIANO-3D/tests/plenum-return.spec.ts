import { expect, test } from "./browser-test";
import { importPlenumFixture, exportPlenumFixture } from "./plenum-ui-fixture";

test("Collega associa il plenum alla ripresa macchina e Ruota 90 gradi conserva l’aggancio", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const before = await importPlenumFixture(page, false, "return");
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
  expect(result.plenums[0].rotation).toBeCloseTo(before.plenums[0].rotation + Math.PI / 2);
  const owner = before.hvacSystems[0].indoorUnits[0];
  expect(result.plenums[0].position.x).toBeCloseTo(owner.position.x - (before.plenums[0].position.y - owner.position.y));
  expect(result.plenums[0].position.y).toBeCloseTo(owner.position.y + (before.plenums[0].position.x - owner.position.x));
});
