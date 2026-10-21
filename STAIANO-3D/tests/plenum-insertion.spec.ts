import { expect, test } from "./browser-test";
import { importPlenumFixture, exportPlenumFixture } from "./plenum-ui-fixture";

test("Plenum richiede un clic sulla macchina e nasce collegato", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const before = await importPlenumFixture(page);
  const tool = page.getByRole("button", { name: "Plenum", exact: true });
  await tool.click();
  const plan = page.getByTestId("editor-2d");
  await plan.click({ position: { x: 100, y: 100 } });
  await expect(page.getByTestId("plenum-2d")).toHaveCount(1);
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("split-2d").first().click();
  await expect(page.getByTestId("plenum-2d")).toHaveCount(2);
  await expect(tool).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByText("Plenum creato e collegato alla macchina."),
  ).toBeVisible();
  const after = await exportPlenumFixture(page);
  const created = after.plenums.find(
    (p) => !before.plenums.some((old) => old.id === p.id),
  )!;
  expect(created.systemId).toBe(after.hvacSystems[0].id);
  expect(created.use).toBe("supply");
  await page.screenshot({ path: ".cache/plenum-inserimento-macchina.png" });
});
