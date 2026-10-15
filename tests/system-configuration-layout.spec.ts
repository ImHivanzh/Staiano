import { pickPlanPoint } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openInspector, openDisclosure } from "./ui-helpers";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  for (const system of [
    "Radiatori",
    "Canalizzato",
    "Split",
    "Ventilconvettori",
  ]) {
    test(`${system}: configuration is readable and usable at ${viewport.width}`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: "Disegna manualmente" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Crea stanza", exact: true })
        .click();
      await openInspector(page, "Configura impianto");
      const dialog = page.getByRole("dialog", {
        name: /^(?:Vista |Configura impianto$)/,
        exact: true,
      });
      const choice = dialog.getByRole("group", {
        name: "Impianto da configurare",
      });
      await expect
        .poll(() =>
          dialog.evaluate((node) => {
            const select = node
              .querySelector('[aria-label="Impianto corrente"]')!
              .getBoundingClientRect();
            const button = [...node.querySelectorAll("button")]
              .find((item) => item.textContent?.trim() === "Nuovo impianto")!
              .getBoundingClientRect();
            return Math.max(
              Math.abs(select.top - button.top),
              Math.abs(select.bottom - button.bottom),
            );
          }),
        )
        .toBeLessThanOrEqual(1);
      await choice.getByRole("button", { name: system, exact: true }).click();
      if (system !== "Canalizzato")
        await openDisclosure(
          dialog,
          "Configurazione da modulo e dettagli tecnici",
        );
      await expect(
        choice.getByRole("button", { name: system, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      if (system === "Radiatori") {
        await dialog
          .getByRole("button", { name: "Trova radiatori compatibili" })
          .scrollIntoViewIfNeeded();
        await expect(
          dialog.getByRole("button", { name: "Trova radiatori compatibili" }),
        ).toBeInViewport();
      }
      await dialog.screenshot({ path: info.outputPath("initial.png") });

      if (system === "Radiatori") {
        await dialog.getByLabel("Marca radiatori").selectOption("Global");
        await dialog.getByLabel("Famiglia radiatori").selectOption("VIP");
        await dialog
          .getByRole("button", { name: "Trova radiatori compatibili" })
          .click();
        await expect(
          dialog.locator(".soluzione-radiatore").first(),
        ).toContainText("VIP");
        await expect(
          dialog
            .locator(".soluzione-radiatore")
            .first()
            .getByRole("button", { name: "Applica e posiziona" }),
        ).toBeEnabled();
      } else if (system === "Canalizzato") {
        await dialog
          .getByRole("button", { name: "Apri planimetria operativa" })
          .click();
        const plan = page.getByRole("region", {
          name: "Configurazione grafica canalizzato",
        });
        await plan
          .getByRole("button", { name: "Macchina", exact: true })
          .click();
        await pickPlanPoint(plan, 2, 2);
        await plan.getByTestId("draft-machine").click();
        const picker = page.getByRole("dialog", {
          name: "Scegli macchina canalizzata",
        });
        await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
        const recommended = picker.locator('[data-recommended="true"]');
        await expect(recommended).toHaveCount(1);
        await expect(recommended).toHaveAttribute("aria-pressed", "true");
        await expect(
          picker
            .locator("footer")
            .getByRole("button", { name: "Salva", exact: true }),
        ).toBeInViewport();
        await picker.screenshot({
          path: info.outputPath("machine-picker.png"),
        });
        await picker
          .locator("footer")
          .getByRole("button", { name: "Salva", exact: true })
          .click();
        await expect(
          plan.getByRole("button", { name: /^Macchina UI/ }),
        ).toHaveCount(1);
        return;
      } else if (system === "Split") {
        await dialog.getByLabel("Marca split").selectOption("Gree");
        await expect(
          dialog.getByRole("heading", { name: "Soluzione selezionata" }),
        ).toBeVisible();
        await dialog
          .getByRole("button", { name: "Configura climatizzazione" })
          .click();
        await expect(
          dialog.getByText(/^Sistema installato: Gree/),
        ).toBeVisible();
      } else {
        const add = dialog.getByRole("button", {
          name: "Aggiungi ventilconvettore",
        });
        await expect(add).toBeEnabled();
        await add.click();
        await expect(
          dialog.getByRole("heading", { name: "Apparecchi nella stanza" }),
        ).toBeVisible();
        await expect(
          dialog.getByText(/Potenza ancora da coprire:/),
        ).toBeVisible();
        await dialog
          .locator(":scope > div")
          .last()
          .evaluate((node) => {
            node.scrollTop = 0;
          });
        await add.scrollIntoViewIfNeeded();
        await expect(add).toBeInViewport();
      }

      await expect
        .poll(() =>
          dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
        )
        .toBe(true);
      const overflow = await dialog
        .locator("button, input, select, img")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              if (!node.getClientRects().length) return false;
              const box = node.getBoundingClientRect();
              return box.left < -1 || box.right > window.innerWidth + 1;
            })
            .map(
              (node) =>
                node.getAttribute("aria-label") || node.textContent?.trim(),
            ),
        );
      expect(overflow).toEqual([]);
      await dialog
        .locator(":scope > div")
        .last()
        .evaluate((node) => {
          node.scrollTop = 0;
        });
      await dialog.screenshot({ path: info.outputPath("configuration.png") });
    });
  }
}
