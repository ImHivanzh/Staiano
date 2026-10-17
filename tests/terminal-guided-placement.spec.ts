import { readFileSync } from "node:fs";
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
  }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const fixture = JSON.parse(
      readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
    ).empty;
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
    await expect(
      popup
        .getByRole("group", { name: "Montaggio terminale" })
        .getByRole("button", { name: "Parete", exact: true }),
    ).toBeVisible();
    await popup.getByRole("tab", { name: "Plenum", exact: true }).click();
    await expect(slotWidth).not.toBeVisible();
    await popup.getByRole("button", { name: "Zincato", exact: true }).click();
    await popup
      .getByRole("button", { name: "Trapezoidale", exact: true })
      .click();
    await popup
      .getByText("Altre posizioni dello stacco", { exact: true })
      .click();
    await popup.getByLabel("Stacco plenum").selectOption("rear");
    await popup.getByRole("tab", { name: "Bocchetta", exact: true }).click();
    await expect(
      popup.getByRole("button", { name: "Zincato", exact: true }),
    ).not.toBeVisible();
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
    await popup.getByRole("tab", { name: "Plenum", exact: true }).click();
    await expect(
      popup.getByRole("button", { name: "Zincato", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      popup.getByRole("button", { name: "Trapezoidale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(popup.getByLabel("Stacco plenum")).toHaveValue("rear");
    await popup
      .getByRole("tab", { name: "Plenum", exact: true })
      .press("ArrowLeft");
    await expect(
      popup.getByRole("tab", { name: "Bocchetta", exact: true }),
    ).toBeFocused();
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
    await edit.getByRole("tab", { name: "Plenum", exact: true }).click();
    await expect(
      edit.getByRole("button", { name: "Zincato", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      edit.getByRole("button", { name: "Trapezoidale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(edit.getByLabel("Stacco plenum")).toHaveValue("rear");
    await edit.getByRole("tab", { name: "Bocchetta", exact: true }).click();
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
      .getByRole("button", { name: "Parete", exact: true })
      .click();
    await edit.getByRole("tab", { name: "Plenum", exact: true }).click();
    await edit.getByLabel("Stacco plenum").selectOption("custom");
    await edit.getByLabel("Descrizione stacco").fill("Due stacchi laterali");
    await edit
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByTestId("terminal-supply").click();
    await expect(
      edit
        .getByRole("group", { name: "Montaggio terminale" })
        .getByRole("button", { name: "Parete", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: `output/verification/terminal-bocchetta-${width}.png`,
      animations: "disabled",
    });
    await edit.getByRole("tab", { name: "Plenum", exact: true }).click();
    await expect(
      edit.getByRole("button", { name: "Zincato", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      edit.getByRole("button", { name: "Trapezoidale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(edit.getByLabel("Stacco plenum")).toHaveValue("custom");
    await expect(edit.getByLabel("Descrizione stacco")).toHaveValue(
      "Due stacchi laterali",
    );
    await expect(edit.getByLabel("Lunghezza su misura (mm)")).toHaveValue(
      "1100",
    );
    await edit
      .getByRole("button", { name: "Zincato", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/verification/terminal-plenum-${width}.png`,
      animations: "disabled",
    });
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
    await edit.getByRole("tab", { name: "Plenum", exact: true }).click();
    await expect(edit.getByLabel("Descrizione stacco")).toHaveValue(
      "Due stacchi laterali",
    );
    await edit
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await pickPlanPoint(plan, 2, 2);
    await plan.getByTestId("draft-terminal").click();
    page.once("dialog", (dialog) => dialog.accept());
    await popup
      .getByRole("button", { name: "Elimina bocchetta", exact: true })
      .click();
    await expect(popup).not.toBeVisible();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(0);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
  });
