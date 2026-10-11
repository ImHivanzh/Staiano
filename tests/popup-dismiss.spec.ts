import { expect, test } from "./browser-test";
import { openInspector } from "./ui-helpers";

for (const [width, height, reducedMotion] of [
  [1920, 1080, "no-preference"],
  [1024, 768, "no-preference"],
  [1024, 768, "reduce"],
] as const) {
  test(`rounded configuration popup dismisses safely at ${width}, motion ${reducedMotion}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    await page.getByRole("button", { name: "Disegna manualmente" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crea stanza", exact: true })
      .click();
    await openInspector(page, "Configura impianto");
    const popup = page.getByRole("dialog", {
      name: "Configura impianto",
      exact: true,
    });
    const css = await popup.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        radius: parseFloat(style.borderRadius),
        name: style.animationName,
        duration: style.animationDuration,
      };
    });
    expect(css.radius).toBeGreaterThanOrEqual(16);
    if (reducedMotion === "reduce") {
      expect(css.name).toBe("none");
      expect(css.duration).toBe("0s");
    } else {
      expect(css.name).toContain("openDialog");
      expect(css.duration).toBe("0.2s");
    }
    await popup
      .getByRole("heading", { name: "Configura impianto", exact: true })
      .click();
    await expect(popup).toBeVisible();
    const frame = (await popup.boundingBox())!;
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.y).toBeGreaterThan(0);
    expect(frame.width).toBeLessThan(width);

    // A gesture that starts in the popup must not become an outside click.
    await page.mouse.move(frame.x + 40, frame.y + 30);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await page.mouse.up();
    await expect(popup).toBeVisible();

    await popup
      .getByRole("group", { name: "Impianto da configurare" })
      .getByRole("button", { name: "Canalizzato", exact: true })
      .click();
    await popup
      .getByRole("button", { name: "Scegli macchina", exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
    });
    await expect(picker).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(picker).toBeHidden();
    await expect(popup).toBeVisible();
    await expect(
      popup.getByRole("button", { name: "Scegli macchina", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: info.outputPath("rounded-popup.png") });
    await page.mouse.click(5, 5);
    await expect(popup).toBeHidden();
    const launch = page.getByRole("button", {
      name: "Configura impianto",
      exact: true,
    });
    await expect(launch).toBeFocused();
    await launch.click();
    await expect(
      popup.getByRole("button", { name: "Scegli macchina", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(launch).toBeFocused();
  });
}
