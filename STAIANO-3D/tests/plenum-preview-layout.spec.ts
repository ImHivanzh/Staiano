import { expect, test } from "./browser-test";
import { importPlenumFixture } from "./plenum-ui-fixture";

for (const width of [1920, 1024]) {
  test(`plenum e flessibili restano utilizzabili a ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const project = await importPlenumFixture(page, true);
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const viewer = page.getByTestId("viewer-3d");
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-rendered",
      "true",
      { timeout: 30000 },
    );
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-plenum-count",
      "1",
    );
    await expect(viewer.locator("canvas")).toHaveAttribute(
      "data-duct-count",
      String(project.ducts!.length),
    );
    await page.screenshot({ path: `.cache/plenum-flessibili-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
