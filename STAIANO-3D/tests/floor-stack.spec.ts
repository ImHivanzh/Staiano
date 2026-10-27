import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("i piani si sovrappongono in 3D, si nascondono e si spostano sopra/sotto", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openDisclosure(page, "File");
  await page
    .getByRole("button", { name: "Impostazioni progetto e piani" })
    .click();
  await page.getByLabel("Nome del nuovo piano").fill("Primo piano");
  await page
    .locator(".gestione-piano")
    .getByRole("button", { name: "Aggiungi piano" })
    .click();
  await expect(page.getByText("Quota 3 m")).toBeVisible();
  await page
    .getByRole("button", { name: "Sposta prima Primo piano", exact: true })
    .click();
  // Spostato in basso: scambia la quota con il piano terra.
  await expect(page.getByText("Quota 3 m")).toBeVisible();
  await expect(page.getByText("Quota 0 m")).toBeVisible();
  await page.getByRole("button", { name: "Planimetria", exact: true }).click();
  await page
    .getByLabel("Piano attivo")
    .first()
    .selectOption({ label: "Piano terra" });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await openDisclosure(page, "Vista 3D");
  const toggle = page.getByRole("button", { name: "Primo piano", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
