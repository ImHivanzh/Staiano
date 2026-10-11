import type { Locator, Page } from "@playwright/test";

/** Exercise the real disclosure control; do not force hidden inputs visible. */
export async function openDisclosure(scope: Page | Locator, name: string) {
  const summary = scope.locator("summary").filter({ hasText: name }).first();
  const open = await summary.evaluate(
    (node) => (node.parentElement as HTMLDetailsElement).open,
  );
  if (!open) await summary.click();
}

export async function openInspector(
  page: Page,
  name: "Modifica stanza" | "Configura impianto" | "Posizione",
) {
  await openDisclosure(page.locator(".proprieta"), name);
  if (name === "Configura impianto")
    await page
      .locator(".proprieta")
      .getByRole("button", { name: "Configura impianto", exact: true })
      .click();
}

export async function openAppearance(page: Page) {
  await openDisclosure(page.getByTestId("viewer-3d"), "Aspetto");
}

export async function chooseTerminalModel(scope: Page | Locator, code: string) {
  const another = scope.getByRole("button", {
    name: "Aggiungi un’altra bocchetta",
    exact: true,
  });
  const change = scope.getByRole("button", {
    name: "Cambia modello bocchetta",
    exact: true,
  });
  if (await another.isVisible()) await another.click();
  else if (await change.isVisible()) await change.click();
  await scope
    .getByLabel("Modello bocchetta", { exact: true })
    .selectOption(code);
  await scope
    .getByRole("button", { name: "Continua con il modello", exact: true })
    .click();
}

export async function confirmTerminalPlacement(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Posiziona bocchetta",
    exact: true,
  });
  await dialog.getByLabel("Adatta planimetria").click();
  const terminal = dialog.locator('[data-testid^="terminal-"]').last();
  const bounds = (await terminal
    .locator("rect, circle")
    .first()
    .boundingBox())!;
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await dialog
    .getByRole("button", { name: "Conferma posizione", exact: true })
    .click();
}
