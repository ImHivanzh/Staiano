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
  // Collega porta la ripresa dietro la macchina (mezzo giro): dopo Ruota 90°
  // il plenum resta solidale, controfacciata e sull’asse della macchina.
  const plenum = result.plenums[0];
  expect(Math.cos(plenum.rotation - machine.rotation)).toBeCloseTo(-1);
  const dx = plenum.position.x - machine.position.x;
  const dy = plenum.position.y - machine.position.y;
  expect(dx * Math.cos(plenum.rotation) + dy * Math.sin(plenum.rotation)).toBeCloseTo(0);
});
