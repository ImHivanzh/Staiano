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
}

export async function openAppearance(page: Page) {
  await openDisclosure(page.getByTestId("viewer-3d"), "Aspetto");
}
