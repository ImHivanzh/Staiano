import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("archive opens before creating a project", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Progetti", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Archivio progetti" }),
  ).toBeVisible();
  await expect(page.getByText("Nessun progetto salvato.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Progetti", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test.describe("phone plan toolbar", () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390])
    test(`scrolls to every tool and opens unclipped menus at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.getByRole("button", { name: "Disegna manualmente" }).tap();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Crea stanza", exact: true })
        .tap();
      const plan = page.getByRole("region", {
        name: "Configurazione grafica canalizzato",
      });
      const toolbar = plan.getByRole("toolbar", {
        name: "Strumenti della planimetria",
      });
      for (const name of ["Seleziona", "Canale", "Macchina", "Collega"]) {
        const tool = toolbar.getByRole("button", { name, exact: true });
        await tool.tap();
        await expect(tool).toHaveAttribute("aria-pressed", "true");
        const box = (await tool.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await openDisclosure(plan, "Disegno e misure");
      const measure = plan.getByRole("button", { name: "Misura", exact: true });
      await expect(measure).toBeVisible();
      const box = (await measure.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThan(844);
      await measure.tap();
      await openDisclosure(plan, "Altre azioni");
      await expect(
        plan.getByRole("button", {
          name: "Annulla ultima modifica",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });
});

test("workspace remains usable at desktop, tablet and phone sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Da misure reali a un progetto chiaro.",
    }),
  ).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/home.png" });
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.screenshot({ path: ".impeccable/review/desktop-2d.png" });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator(".pianta")).toBeVisible();
    const editor = await page.locator(".area-editor").boundingBox();
    expect(editor!.height).toBeGreaterThanOrEqual(320);
    expect(editor!.width).toBeGreaterThan(280);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (viewport.width <= 900) {
      await expect(
        page.getByLabel("Piano attivo su schermo ridotto"),
      ).toBeVisible();
      await expect(page.getByLabel("Ambiente su schermo ridotto")).toHaveValue(
        /.+/,
      );
    }
    if (viewport.width === 1024) {
      await page.screenshot({ path: ".impeccable/review/tablet.png" });
    }
    if (viewport.width === 390) {
      expect(editor!.y).toBeLessThan(420);
      const floorSelect = page.getByLabel("Piano attivo su schermo ridotto");
      expect((await floorSelect.boundingBox())!.width).toBeGreaterThanOrEqual(
        140,
      );
      await page.screenshot({ path: ".impeccable/review/mobile-2d.png" });
    }
    const panelToggle = page.getByRole("button", { name: "Mostra proprietà" });
    await panelToggle.click();
    await expect(page.locator("#proprieta-progetto")).toBeHidden();
    await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
    await panelToggle.click();
    await expect(page.locator("#proprieta-progetto")).toBeVisible();
    await page.locator(".configuratore").evaluate((node) => {
      node.scrollTop = 0;
    });
  }

  await page.locator(".proprieta").scrollIntoViewIfNeeded();
  await page
    .locator(".proprieta summary")
    .filter({ hasText: "Modifica stanza" })
    .click();
  await expect(page.getByLabel("Nome stanza", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/mobile-properties.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".configuratore").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({ path: ".impeccable/review/desktop.png" });
  await page
    .getByTestId("viewer-3d")
    .getByText("Aspetto", { exact: true })
    .click();
  await expect(page.getByLabel("Finitura pavimento")).toBeVisible();
  const appearance = await page.getByLabel("Finitura pavimento").boundingBox();
  const canvas = await page.getByTestId("viewer-3d").boundingBox();
  expect(appearance!.y + appearance!.height).toBeLessThan(
    canvas!.y + canvas!.height,
  );
  await page
    .getByTestId("viewer-3d")
    .getByText("Aspetto", { exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const viewer = page.getByTestId("viewer-3d");
  await page.locator(".configuratore").evaluate((node) => {
    node.scrollTop = 0;
  });
  const mobileViewer = await viewer.boundingBox();
  expect(mobileViewer!.height).toBeGreaterThanOrEqual(340);
  expect(mobileViewer!.height).toBeLessThanOrEqual(480);
  await expect(viewer.locator("canvas")).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/mobile.png" });
});
