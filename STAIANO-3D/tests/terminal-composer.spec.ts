import { test, expect } from "./browser-test";
import { execFileSync } from "node:child_process";
import { pickTerminalLength, terminalLengthButton } from "./ui-helpers";

const original = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
  import { guidedProjectFixture, addGuidedTerminal } from './tests/guided-fixture.ts';
  import { ensureInstallations } from './src/domain/installations.ts';
  import { placeMachineOnPlan } from './src/domain/ducted/graphic-installation.ts';
  let p = ensureInstallations(guidedProjectFixture(1));
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {x:2,y:4});
  p = addGuidedTerminal(p, 1000, 'EDLS');
  p.airTerminals[0].color = 'RAL9016';
  p.airTerminals[0].finish = 'RAL9016';
  console.log(JSON.stringify(p));
`,
    ],
    { encoding: "utf8" },
  ),
);

for (const width of [1920, 1024]) {
  test.describe(`compositore bocchetta ${width}`, () => {
    test.use({
      viewport: { width, height: width === 1920 ? 1080 : 768 },
      hasTouch: width === 1024,
    });
    test("moduli grafici, su misura e finitura persistono dopo il salvataggio", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByTestId("project-file").setInputFiles({
        name: "composer.hvacproj",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(original)),
      });
      await page
        .getByRole("button", { name: "Continua liberamente nell’editor" })
        .click();
      const plan = page.getByRole("region", {
        name: "Configurazione grafica canalizzato",
      });
      await plan.getByTestId("terminal-supply").first().click();
      const dialog = page.getByRole("dialog", {
        name: "Configura bocchetta",
        exact: true,
      });
      await expect(
        dialog.getByRole("tab", { name: "Plenum", exact: true }),
      ).toHaveCount(0);
      await expect(dialog.getByLabel("Stacco plenum")).toHaveCount(0);
      await expect(plan.getByTestId("plenum-2d")).toHaveCount(0);
      const composition = dialog.getByRole("group", {
        name: "Composizione della bocchetta",
        exact: true,
      });
      await expect(
        composition.getByRole("button", {
          name: "Seleziona modulo 1",
          exact: true,
        }),
      ).toContainText("1000 mm");
      await dialog
        .getByRole("button", {
          name: "SU MISURA · quotazione Ecoclima",
          exact: true,
        })
        .click();
      await dialog.getByLabel("Lunghezza su misura (mm)").fill("1100");
      await expect(
        composition.getByRole("button", {
          name: "Seleziona modulo 1",
          exact: true,
        }),
      ).toContainText("1100 mm");
      await expect(
        dialog.getByRole("button", {
          name: "Aggiungi modulo nello stesso punto",
        }),
      ).toBeDisabled();
      await dialog
        .getByRole("button", { name: /Usa taglia consigliata/ })
        .click();
      await dialog
        .getByRole("button", { name: "Aggiungi modulo nello stesso punto" })
        .click();
      await expect(
        composition.getByRole("button", {
          name: "Seleziona modulo 2",
          exact: true,
        }),
      ).toContainText("Scegli misura");
      await pickTerminalLength(dialog, 1200, 2);
      await pickTerminalLength(dialog, 800);
      await expect(
        composition.getByRole("button", {
          name: "Seleziona modulo 2",
          exact: true,
        }),
      ).toContainText("1200 mm");
      await composition
        .getByRole("button", { name: "Seleziona modulo 2", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Rimuovi modulo 2", exact: true })
        .click();
      await expect(
        composition.getByRole("button", {
          name: "Seleziona modulo 2",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(terminalLengthButton(dialog, 800)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await dialog
        .getByRole("button", { name: "Aggiungi modulo nello stesso punto" })
        .click();
      await pickTerminalLength(dialog, 1000, 2);
      await dialog
        .getByRole("button", { name: "RAL 9005 · Nero", exact: true })
        .click();
      await expect(
        composition.locator('svg[data-finish="RAL9005"]'),
      ).toHaveCount(2);
      const mounting = dialog.getByRole("group", {
        name: "Montaggio terminale",
      });
      await expect(
        mounting.getByRole("button", { name: "Parete", exact: true }),
      ).toHaveCount(0);
      await expect(
        mounting.getByRole("button", { name: "Soffitto", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await composition.scrollIntoViewIfNeeded();
      expect(
        await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
      await dialog.screenshot({
        path: `.cache/terminal-composer-final-${width}.png`,
      });
      await dialog
        .locator("footer")
        .getByRole("button", { name: "Salva", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(plan.getByTestId("terminal-supply")).toHaveCount(2);
      await expect(plan.getByTestId("plenum-2d")).toHaveCount(0);
      await expect(page.getByTestId("save-status")).toHaveText("Salvato");
      await page.reload();
      await plan.getByTestId("terminal-supply").first().click();
      await expect(
        composition.locator('svg[data-finish="RAL9005"]'),
      ).toHaveCount(2);
      await expect(terminalLengthButton(dialog, 800)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await composition
        .getByRole("button", { name: "Seleziona modulo 2", exact: true })
        .click();
      await expect(terminalLengthButton(dialog, 1000, 2)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        mounting.getByRole("button", { name: "Soffitto", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
}
