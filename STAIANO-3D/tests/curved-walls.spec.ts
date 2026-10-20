import { test, expect } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

test("straight and curved drawing preserve one-step undo, cancel and project persistence", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Disegna manualmente" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  const walls = plan.getByTestId("wall");
  await expect(walls).toHaveCount(4);
  await page.keyboard.press("u");
  await expect(page.locator(".indicazione-editor")).toContainText(
    "punto iniziale",
  );
  await pickPlanPoint(plan, 1, 1);
  await pickPlanPoint(plan, 3, 1);
  await expect(page.locator(".indicazione-editor")).toContainText(
    "attraversato dalla curva",
  );
  await pickPlanPoint(plan, 2, 2);
  await expect.poll(() => walls.count()).toBeGreaterThan(5);
  const count = await walls.count();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: ".impeccable/review/curved-walls.png",
    fullPage: true,
  });
  await page.keyboard.press("Control+z");
  await expect(walls).toHaveCount(4);
  await page.keyboard.press("Control+y");
  await expect(walls).toHaveCount(count);
  await page.keyboard.press("u");
  await pickPlanPoint(plan, 1, 3);
  await pickPlanPoint(plan, 3, 3);
  await page.keyboard.press("Escape");
  await expect(walls).toHaveCount(count);
  await expect(plan.getByTestId("curve-preview")).toHaveCount(0);
  await page.keyboard.press("l");
  await pickPlanPoint(plan, 1, 3);
  await pickPlanPoint(plan, 3, 3);
  await page.keyboard.press("Escape");
  await expect(walls).toHaveCount(count + 1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(count + 1);
});
