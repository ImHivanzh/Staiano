import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024]) {
  test(`radiator catalog exposes sorted verified Ardesia sizes at ${width}`, async ({
    page,
  }, info) => {
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
    await expect(popup).toContainText("Sovratemperatura acqua/ambiente");
    await expect(popup).toContainText("(75 + 65) / 2 − 20 = 50 K");
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
      path: info.outputPath(`radiator-buttons-${width}.png`),
    });
  });
}

test("a single compatible radiator solution is applied and selected at once", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
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
  // Più altezze compatibili: la scelta resta aperta e nulla viene applicato.
  await popup
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  await expect(popup.locator(".soluzione-radiatore")).not.toHaveCount(0);
  await expect(popup).toHaveCount(1);
  await expect(plan.getByTestId("radiator-2d")).toHaveCount(0);
  // Criteri che ammettono un solo radiatore: il calcolo parte da solo, la
  // ricerca sparisce e l'applicazione resta al comando Salva del popup.
  await popup
    .getByLabel("Potenza da coprire con questo punto (W)")
    .fill("1000");
  await popup.getByRole("button", { name: /ALTEZZA 500/ }).click();
  await expect(
    popup.getByRole("button", { name: "Trova radiatori compatibili" }),
  ).toHaveCount(0);
  await expect(
    popup.getByRole("button", { name: "Selezionata", exact: true }),
  ).toBeEnabled();
  await expect(plan.getByTestId("radiator-2d")).toHaveCount(0);
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  const placed = plan.getByTestId("radiator-2d");
  await expect(placed).toHaveCount(1);
  await expect(placed.locator("rect")).toHaveClass(/scelto/);
});
