import { expect, test } from "./browser-test";
import { importPlenumFixture, exportPlenumFixture } from "./plenum-ui-fixture";

test("imposta il collare frontale del plenum e lo conserva nel progetto", async ({
  page,
}) => {
  await importPlenumFixture(page);
  await page.getByTestId("plenum-2d").click();
  await page.getByLabel("Direzione stacchi").selectOption("front");
  await page.getByRole("button", { name: "Applica plenum" }).click();
  const saved = await exportPlenumFixture(page);
  expect(saved.plenums[0].connectionPosition).toBe("front");
  expect(saved.plenums[0].connectionPositions).toEqual(["front"]);
});

test("Collega associa il plenum separato alla bocchetta e salva i flessibili", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const before = await importPlenumFixture(page);
  await page.getByRole("button", { name: "Collega", exact: true }).click();
  await page.getByTestId("plenum-2d").locator("rect").click();
  await page.getByTestId("terminal-supply").first().click();
  await expect(page.getByText(/Collegamento salvato/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Collega", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Collega", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("connection-preview")).toHaveCount(0);
  const result = await exportPlenumFixture(page);
  expect(result.plenums[0].attachmentId).toBe(before.airTerminals[0].id);
  expect(result.ducts).toHaveLength(result.plenums[0].portCount!);
  expect(result.ducts!.every((d) => d.kind === "flexible")).toBe(true);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-duct-count",
    String(result.ducts!.length),
    { timeout: 30000 },
  );
  await page.screenshot({ path: ".cache/plenum-collegato-3d.png" });
  await page
    .getByRole("button", { name: "Configura percorsi", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Canalizzazione collegata",
    exact: true,
  });
  await dialog.locator("details").first().locator("summary").first().click();
  const ducts = dialog.getByRole("region", {
    name: "Canalizzazione collegata",
  });
  await ducts.locator("details").first().locator("summary").first().click();
  await ducts
    .getByRole("button", { name: "Modifica percorso in 3D" })
    .first()
    .click();
  await expect(dialog).toHaveCount(0);
  await page.screenshot({ path: ".cache/flessibile-percorso-3d.png" });
  const edited = await exportPlenumFixture(page);
  expect(edited.ducts![0].routing).toBe("manual");
  expect(edited.ducts![0].waypoints.length).toBeGreaterThan(0);
});
