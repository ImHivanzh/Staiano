import { execFileSync } from "node:child_process";
import { expect, test } from "./browser-test";
import {
  openDisclosure,
  pickPlanPoint,
  pickTerminalLength,
  terminalLengthButton,
} from "./ui-helpers";

for (const width of [1920, 1024])
  test(`terminal catalog on the plan: available models, supply and return at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const fixture = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        import { guidedProjectFixture } from './tests/guided-fixture.ts';
        import { placeMachineOnPlan } from './src/domain/ducted/graphic-installation.ts';
        let p = guidedProjectFixture();
        p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 4 });
        console.log(JSON.stringify(p));
      `,
        ],
        { encoding: "utf8" },
      ),
    );
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "vents.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page
      .getByRole("button", { name: "Continua liberamente nell’editor" })
      .click();
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await pickPlanPoint(plan, 4, 2);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-terminal").click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-terminal").click();
    const popup = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
    });
    const primary = popup.getByRole("group", { name: "Bocchette principali" });
    await expect(primary.getByRole("img")).toHaveCount(4);
    await expect
      .poll(() =>
        primary
          .getByRole("img")
          .evaluateAll((nodes) =>
            nodes.every((node) => (node as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true);
    await expect(
      primary.getByRole("button", { name: "Scegli EGA6" }),
    ).toHaveCount(0);
    await openDisclosure(popup, "Tutti i modelli Ecoclima");
    await expect(
      popup
        .getByRole("group", { name: "Bocchette principali" })
        .getByRole("button", { name: "Scegli EDSC-C", exact: true }),
    ).toBeVisible();
    await popup.getByRole("button", { name: "Ripresa", exact: true }).click();
    await expect(
      primary.getByRole("button", { name: "Scegli EDLS", exact: true }),
    ).toHaveCount(0);
    await primary
      .getByRole("button", { name: "Scegli EGA6", exact: true })
      .click();
    await expect(
      popup.getByRole("heading", { name: "Modello · EGA6" }),
    ).toBeVisible();
    await popup.getByRole("button", { name: "Mandata", exact: true }).click();
    await primary
      .getByRole("button", { name: "Scegli EDFL-20", exact: true })
      .click();
    await popup
      .getByRole("group", { name: "Numero di feritoie" })
      .getByRole("button", { name: "1 feritoia", exact: true })
      .click();
    await openDisclosure(popup, "Prestazioni e misura feritoie");
    await expect(
      popup
        .getByRole("group", { name: "Soluzione terminale", exact: true })
        .locator('button[aria-pressed="true"]'),
    ).toContainText("dB(A)");
    await pickTerminalLength(popup, 1000);
    await popup
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(0);
    await plan.getByTestId("draft-terminal").click();
    await popup
      .getByRole("button", { name: "Scegli EDLS", exact: true })
      .click();
    const slotWidth = popup.getByRole("group", {
      name: "Dimensione della feritoia (mm)",
    });
    await expect(
      slotWidth.getByRole("button", { name: "30 mm", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const mounting = popup.getByRole("group", { name: "Montaggio terminale" });
    await expect(
      mounting.getByRole("button", { name: "Parete", exact: true }),
    ).toBeVisible();
    await expect(
      mounting.getByRole("button", { name: "Soffitto", exact: true }),
    ).toBeVisible();
    await mounting.getByRole("button", { name: "Parete", exact: true }).click();
    await expect(
      popup.getByRole("tab", { name: "Plenum", exact: true }),
    ).toHaveCount(0);
    await expect(popup.getByLabel("Stacco plenum")).toHaveCount(0);
    const length = terminalLengthButton(popup, 1000);
    await length.click();
    const white = popup
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true });
    await white.click();
    await openDisclosure(popup, "Aspetto e finiture facoltativi");
    const style = popup.getByLabel("Stile scelto");
    await style.fill("Finitura da preservare");
    await slotWidth.getByRole("button", { name: "20 mm", exact: true }).click();
    await expect(length).toHaveAttribute("aria-pressed", "true");
    await expect(white).toHaveAttribute("aria-pressed", "true");
    await expect(style).toHaveValue("Finitura da preservare");
    await slotWidth.getByRole("button", { name: "30 mm", exact: true }).click();
    await expect(length).toHaveAttribute("aria-pressed", "true");
    await expect(white).toHaveAttribute("aria-pressed", "true");
    await expect(style).toHaveValue("Finitura da preservare");
    await openDisclosure(popup, "Prestazioni e misura feritoie");
    const performance = popup.getByRole("group", {
      name: "Soluzione terminale",
      exact: true,
    });
    await expect(
      performance.locator('button[aria-pressed="true"]'),
    ).toContainText("30 mm");
    await expect(
      performance.locator('button[aria-pressed="true"]'),
    ).toContainText("dB(A)");
    await popup
      .getByRole("group", { name: "Numero di feritoie" })
      .getByRole("button", { name: "2 feritoie", exact: true })
      .click();
    await expect(
      performance.locator('button[aria-pressed="true"]'),
    ).toContainText("dB(A)");
    await popup
      .getByRole("group", { name: "Numero di feritoie" })
      .getByRole("button", { name: "1 feritoia", exact: true })
      .click();
    await slotWidth.getByRole("button", { name: "30 mm", exact: true }).click();
    await performance.getByRole("button", { name: /32 dB\(A\)/ }).click();
    await expect(
      performance.locator('button[aria-pressed="true"]'),
    ).toContainText("32 dB(A)");
    await pickTerminalLength(popup, 1000);
    await popup
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
      .click();
    await popup
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByTestId("terminal-supply").click();
    const edit = page.getByRole("dialog", {
      name: "Configura bocchetta",
      exact: true,
    });
    await expect(
      edit
        .getByRole("group", { name: "Dimensione della feritoia (mm)" })
        .getByRole("button", { name: "30 mm", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      edit
        .getByRole("group", { name: "Montaggio terminale" })
        .getByRole("button", { name: "Parete", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      edit.getByRole("tab", { name: "Plenum", exact: true }),
    ).toHaveCount(0);
    await expect(plan.getByTestId("plenum-2d")).toHaveCount(0);
    await openDisclosure(edit, "Prestazioni e misura feritoie");
    await expect(
      edit
        .getByRole("group", { name: "Soluzione terminale", exact: true })
        .locator('button[aria-pressed="true"]'),
    ).toContainText("32 dB(A)");
    await edit
      .getByRole("button", {
        name: "SU MISURA · quotazione Ecoclima",
        exact: true,
      })
      .click();
    await expect(edit).toContainText("quotazione da richiedere a Ecoclima");
    await edit.getByLabel("Lunghezza su misura (mm)").fill("1100");
    await edit
      .getByRole("group", { name: "Dimensione della feritoia (mm)" })
      .getByRole("button", { name: "20 mm", exact: true })
      .click();
    await expect(edit.getByLabel("Lunghezza su misura (mm)")).toHaveValue(
      "1100",
    );
    await expect(
      edit.getByRole("button", { name: "RAL 9016 · Bianco", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await edit
      .getByRole("group", { name: "Dimensione della feritoia (mm)" })
      .getByRole("button", { name: "30 mm", exact: true })
      .click();
    await edit
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByTestId("terminal-supply").click();
    await expect(
      edit.getByRole("button", {
        name: "SU MISURA · quotazione Ecoclima",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(edit.getByLabel("Lunghezza su misura (mm)")).toHaveValue(
      "1100",
    );
    await edit
      .getByRole("group", { name: "Montaggio terminale" })
      .getByRole("button", { name: "Soffitto", exact: true })
      .click();
    await edit
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByTestId("terminal-supply").click();
    const editMounting = edit.getByRole("group", {
      name: "Montaggio terminale",
    });
    await expect(
      editMounting.getByRole("button", { name: "Parete", exact: true }),
    ).toBeVisible();
    await expect(
      editMounting.getByRole("button", { name: "Soffitto", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: info.outputPath(`terminal-bocchetta-${width}.png`),
      animations: "disabled",
    });
    await expect(edit.getByLabel("Descrizione stacco")).toHaveCount(0);
    await expect(edit.getByLabel("Lunghezza su misura (mm)")).toHaveValue(
      "1100",
    );
    const deleteTerminal = edit.getByRole("button", {
      name: "Elimina bocchetta",
      exact: true,
    });
    page.once("dialog", (dialog) => dialog.dismiss());
    await deleteTerminal.click();
    await expect(edit).toBeVisible();
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await deleteTerminal.click();
    await expect(edit).not.toBeVisible();
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(0);
    await page.getByRole("button", { name: "Annulla", exact: true }).click();
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await plan.getByTestId("terminal-supply").click();
    await expect(edit.getByLabel("Descrizione stacco")).toHaveCount(0);
    await edit
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await pickPlanPoint(plan, 2, 2);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-terminal").click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-terminal").click();
    page.once("dialog", (dialog) => dialog.accept());
    await popup
      .getByRole("button", { name: "Elimina bocchetta", exact: true })
      .click();
    await expect(popup).not.toBeVisible();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(0);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
  });
