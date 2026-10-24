import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  for (const system of [
    "Radiatori",
    "Canalizzato",
    "Split",
    "Ventilconvettori",
  ] as const) {
    test(`${system}: configuration is readable and usable at ${viewport.width}`, async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: "Disegna manualmente" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Crea stanza", exact: true })
        .click();
      const plan = page.getByRole("region", {
        name: "Configurazione grafica canalizzato",
      });
      const tools = {
        Radiatori: ["Radiatore", "radiator"],
        Canalizzato: ["Macchina", "machine"],
        Split: ["Split", "split"],
        Ventilconvettori: ["Ventilconvettore", "fanCoil"],
      };
      const [label, type] = tools[system];
      await plan.getByRole("button", { name: label, exact: true }).click();
      await pickPlanPoint(plan, 2, 1);
      if (system === "Canalizzato") {
        await plan
          .getByRole("button", { name: "Bocchetta", exact: true })
          .click();
        await pickPlanPoint(plan, 3, 0.5);
        await plan
          .getByRole("button", { name: "Collega", exact: true })
          .click();
        await plan.getByTestId("draft-machine").click();
        await plan.getByTestId("draft-terminal").click();
        await page.keyboard.press("Escape");
      }
      await plan.getByTestId(`draft-${type}`).click();
      const dialog = page.getByRole("dialog", {
        name:
          system === "Canalizzato"
            ? "Scegli macchina canalizzata"
            : "Configura apparecchio",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await expect(
        dialog
          .locator("footer")
          .getByRole("button", { name: "Salva", exact: true }),
      ).toBeInViewport();
      if (system === "Radiatori") {
        await dialog
          .getByRole("group", { name: "Marca radiatori", exact: true })
          .getByRole("button", { name: "Global", exact: true })
          .click();
        await dialog
          .getByRole("group", { name: "Famiglia radiatori", exact: true })
          .getByText("VIP", { exact: true })
          .click();
        await dialog
          .getByLabel("Potenza da coprire con questo punto (W)")
          .fill("1800");
        await dialog
          .getByRole("button", { name: "Trova radiatori compatibili" })
          .click();
        await expect(
          dialog.getByRole("button", { name: "Selezionata", exact: true }),
        ).toBeEnabled();
      }
      await dialog.screenshot({ path: info.outputPath("configuration.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(plan.getByTestId(`draft-${type}`)).toHaveCount(1);
    });
  }
}
