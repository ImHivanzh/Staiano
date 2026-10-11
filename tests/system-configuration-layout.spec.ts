import { chooseTerminalModel, confirmTerminalPlacement } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openInspector } from "./ui-helpers";

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
        name: "Configura impianto",
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
      await expect(
        choice.getByRole("button", { name: system, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      if (system === "Radiatori")
        await expect(
          dialog.getByRole("button", { name: "Trova radiatori compatibili" }),
        ).toBeInViewport();
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
          .getByRole("button", { name: "Scegli macchina", exact: true })
          .click();
        const picker = page.getByRole("dialog", {
          name: "Scegli macchina canalizzata",
        });
        await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
        await picker
          .getByRole("region", { name: "Modelli macchina compatibili" })
          .getByRole("button")
          .filter({ hasText: "FBA50A9" })
          .click();
        await expect(picker.getByLabel("Macchina selezionata")).toContainText(
          "FBA50A9",
        );
        await picker.screenshot({
          path: info.outputPath("machine-picker.png"),
        });
        await picker
          .getByRole("button", { name: "Configura canalizzato", exact: true })
          .click();
        const plenum = dialog.getByRole("region", {
          name: "Plenum di mandata",
        });
        await expect(
          plenum.getByRole("heading", { name: "Prima aggiungi le bocchette" }),
        ).toBeVisible();
        await expect(plenum.getByRole("img")).toHaveCount(0);
        await chooseTerminalModel(dialog, "EDLS");
        await expect(
          dialog.getByRole("heading", {
            name: "Passo 2 di 3 · EDLS",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByLabel("Lunghezza singola bocchetta", { exact: true }),
        ).toBeInViewport();
        await expect(
          dialog.getByRole("button", {
            name: "Posiziona nell’ambiente",
            exact: true,
          }),
        ).toBeInViewport();
        await expect
          .poll(() =>
            dialog.evaluate((node) => {
              const input = node
                .querySelector('[aria-label="Lunghezza singola bocchetta"]')!
                .getBoundingClientRect();
              const button = [...node.querySelectorAll("button")]
                .find(
                  (item) =>
                    item.textContent?.trim() === "Posiziona nell’ambiente",
                )!
                .getBoundingClientRect();
              return button.top - input.bottom;
            }),
          )
          .toBeGreaterThanOrEqual(0);
        await dialog
          .getByLabel("Lunghezza singola bocchetta", { exact: true })
          .fill("1000");
        await dialog
          .getByRole("button", {
            name: "Posiziona nell’ambiente",
            exact: true,
          })
          .click();
        await confirmTerminalPlacement(page);
        const diagram = plenum.getByRole("img", {
          name: /^Schema plenum di mandata:/,
        });
        await expect(diagram).toBeVisible();
        await expect(
          plenum.getByLabel("Da completare nel plenum"),
        ).toContainText("ripresa");
        expect((await diagram.boundingBox())!.width).toBeLessThanOrEqual(300);
        expect((await diagram.boundingBox())!.height).toBeLessThanOrEqual(180);
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
