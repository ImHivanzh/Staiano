import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("porte 3D con ante, livello Porte attivabile per vedere il vano vuoto", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page
    .getByTestId("project-file")
    .setInputFiles("tests/fixtures/realistic-home.hvacproj");
  await expect(page.locator(".nome-stanza")).toHaveCount(4);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await expect(canvas).not.toHaveAttribute("data-door-leaves", "0");
  await page.screenshot({ path: info.outputPath("porte-con-ante.png") });
  await openDisclosure(page, "Vista 3D");
  const layer = page.getByRole("button", { name: "Porte", exact: true });
  await expect(layer).toHaveAttribute("aria-pressed", "true");
  await layer.click();
  await expect(layer).toHaveAttribute("aria-pressed", "false");
  await expect(canvas).toHaveAttribute("data-door-leaves", "0");
  await page.screenshot({ path: info.outputPath("porte-vano-vuoto.png") });
  await layer.click();
  await expect(canvas).not.toHaveAttribute("data-door-leaves", "0");
});
