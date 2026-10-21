import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

export function terminalLengthButton(
  scope: Page | Locator,
  length: number,
  module = 1,
) {
  return scope
    .getByRole("group", {
      name:
        module === 1
          ? /^Lunghezza (singola bocchetta|modulo 1)$/
          : `Lunghezza modulo ${module}`,
      exact: true,
    })
    .getByRole("button", { name: `${length} mm`, exact: true });
}
export async function pickTerminalLength(
  scope: Page | Locator,
  length: number,
  module = 1,
) {
  const moduleButton = scope.getByRole("button", {
    name: `Seleziona modulo ${module}`,
    exact: true,
  });
  if (await moduleButton.count()) await moduleButton.click();
  await terminalLengthButton(scope, length, module).click();
}

export async function pickPlanPoint(scope: Locator, x: number, y: number) {
  const svg = scope.getByTestId("editor-2d");
  const position = await svg.evaluate(
    (node, point) => {
      const at = new DOMPoint(point.x, point.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      const bounds = node.getBoundingClientRect();
      return { x: at.x - bounds.left, y: at.y - bounds.top };
    },
    { x, y },
  );
  await svg.click({ position });
}

export async function addPlanTerminal(
  page: Page,
  x: number,
  y: number,
  code: string,
  lengths: number[] = [],
  use: "supply" | "return" = "supply",
  machineIndex = 0,
) {
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("group", { name: "Funzione bocchetta", exact: true })
    .getByRole("button", {
      name: use === "supply" ? "Mandata" : "Ripresa",
      exact: true,
    })
    .click();
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, x, y);
  await plan.getByRole("button", { name: "Seleziona", exact: true }).click();
  await plan.getByTestId("draft-terminal").last().click();
  const popup = page.getByRole("dialog", {
    name: "Scegli bocchetta sul punto",
  });
  await chooseTerminalModel(popup, code);
  const ceiling = popup
    .getByRole("group", { name: "Montaggio terminale" })
    .getByRole("button", { name: "Soffitto", exact: true });
  if (await ceiling.count()) await ceiling.click();
  if (lengths.length) {
    await pickTerminalLength(popup, lengths[0]);
    for (let index = 1; index < lengths.length; index++) {
      await popup
        .getByRole("button", { name: "Aggiungi modulo nello stesso punto" })
        .click();
      await pickTerminalLength(popup, lengths[index], index + 1);
    }
  }
  const colors = popup.getByRole("group", {
    name: "Colore scelto",
    exact: true,
  });
  if (await colors.count()) await colors.getByRole("button").first().click();
  else await popup.getByLabel("Colore scelto", { exact: true }).fill("RAL9016");
  await popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId(`terminal-${use}`).last().focus();
  await page.keyboard.press("Enter");
  await plan
    .getByRole("button", { name: /^Macchina UI/ })
    .nth(machineIndex)
    .click();
  await page.keyboard.press("Escape");
  return plan;
}

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
      .getByRole("button", {
        name: /^(?:Vista |Configura impianto$)/,
        exact: true,
      })
      .click();
  if (name === "Configura impianto") {
    const current = page
      .getByRole("dialog", { name: /^(?:Vista |Configura impianto$)/ })
      .getByLabel("Impianto corrente");
    if ((await current.inputValue()) === "") {
      await page
        .getByRole("button", { name: "Nuovo impianto", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Nuovo impianto", exact: true })
        .getByRole("button", { name: "Crea impianto e apri vista" })
        .click();
    }
    const traditional = page
      .getByRole("dialog", { name: /^(?:Vista |Configura impianto$)/ })
      .locator("summary")
      .filter({ hasText: "Configurazione da modulo e dettagli tecnici" })
      .first();
    if (await traditional.isVisible())
      await openDisclosure(
        page.getByRole("dialog", { name: /^(?:Vista |Configura impianto$)/ }),
        "Configurazione da modulo e dettagli tecnici",
      );
  }
}

export async function openAppearance(page: Page) {
  await openDisclosure(page.getByTestId("viewer-3d"), "Aspetto");
}

export async function chooseTerminalModel(scope: Page | Locator, code: string) {
  const traditional = scope
    .locator("summary")
    .filter({ hasText: "Configurazione da modulo e dettagli tecnici" })
    .first();
  if (await traditional.isVisible())
    await openDisclosure(scope, "Configurazione da modulo e dettagli tecnici");
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
  const model = scope.getByRole("button", {
    name: `Scegli ${code}`,
    exact: true,
  });
  if (!(await model.first().isVisible()))
    await openDisclosure(scope, "Tutti i modelli Ecoclima");
  await model.first().click();
}

export async function dragPlanDevice(
  page: Page,
  scope: Locator,
  device: Locator,
  x: number,
  y: number,
) {
  const start = await device.locator("rect").first().boundingBox();
  if (!start) throw new Error("Device is not visible");
  const end = await scope.getByTestId("editor-2d").evaluate(
    (node, point) => {
      const at = new DOMPoint(point.x, point.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: at.x, y: at.y };
    },
    { x, y },
  );
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}
