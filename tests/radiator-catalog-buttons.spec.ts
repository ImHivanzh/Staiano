import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024]) {
  test(`radiator catalog exposes sorted verified Ardesia sizes at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await page.goto("/");
    await page.getByRole("button", { name: "Disegna manualmente" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crea stanza", exact: true })
      .click();
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan.getByRole("button", { name: "Radiatore", exact: true }).click();
    await pickPlanPoint(plan, 2, 0.4);
    await plan.getByTestId("draft-radiator").click();
    const popup = page.getByRole("dialog", {
      name: "Configura apparecchio",
      exact: true,
    });
    await popup.getByRole("button", { name: "Cordivari", exact: true }).click();
    await popup.getByRole("button", { name: "Ardesia", exact: true }).click();
    await popup.getByRole("button", { name: "2 colonne", exact: true }).click();
    const sizes = popup.getByRole("button", { name: /^ALTEZZA/ });
    await expect(sizes).toHaveCount(27);
    const labels = await sizes.allTextContents();
    const heights = labels.map((label) =>
      Number(label.match(/ALTEZZA\s*(\d+)/)![1]),
    );
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(labels.every((label) => /INTERASSE\s*\d+/.test(label))).toBe(true);
    await sizes.first().click();
    await expect(sizes.first()).toHaveAttribute("aria-pressed", "true");
    expect(
      await popup.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await popup.screenshot({
      path: `output/verification/radiator-buttons-${width}.png`,
    });
  });
}
