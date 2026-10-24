import { test, expect } from "./browser-test";
import { readFileSync } from "node:fs";
import { openDisclosure, pickTerminalLength } from "./ui-helpers";

for (const width of [1024, 1920])
  test(`links pump, ducted indoor unit and vents before configuration at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "connections.hvacproj",
      mimeType: "application/json",
      buffer: readFileSync("tests/fixtures/unconfigured-connections.json"),
    });
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan.getByTestId("draft-machine").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".notifica-toast[role=alert]")).toContainText(
      "Collega prima le bocchette",
    );
    if (width === 1920) {
      await expect(page.locator(".notifica-toast[role=alert]")).toHaveCount(0, {
        timeout: 10000,
      });
      await plan.getByTestId("draft-machine").click();
      await expect(page.locator(".notifica-toast[role=alert]")).toBeVisible();
      await page
        .getByRole("button", { name: "Chiudi errore", exact: true })
        .click();
    }
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await plan.getByTestId("draft-terminal").click();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".notifica-toast[role=alert]")).toContainText(
      "Collega prima la bocchetta",
    );
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-heatPump").click();
    await plan.getByTestId("draft-machine").click();
    await expect(plan.getByTestId("pending-connection")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-machine").click();
    await plan.getByTestId("draft-terminal").click();
    await expect(plan.getByTestId("pending-connection")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-terminal").click();
    await expect(page.locator(".notifica-toast[role=alert]")).toHaveText(
      "Configura prima la macchina.",
    );
    await expect(page.locator(".notifica-toast[role=alert]")).toHaveClass(
      /notifica-toast/,
    );
    await page
      .getByRole("button", { name: "Chiudi errore", exact: true })
      .click();
    await expect(page.locator(".notifica-toast[role=alert]")).toHaveCount(0);
    await plan.getByTestId("draft-machine").click();
    const machine = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await expect(machine).toBeVisible();
    const considered = machine.getByRole("region", {
      name: "Ambienti considerati",
    });
    await expect(considered.getByRole("listitem")).toHaveCount(1);
    await expect(considered).toContainText("Soggiorno");
    await expect(considered).toContainText("4,54 kW");
    await expect(
      machine.getByRole("button", { name: "Catalogo verificato" }),
    ).toBeDisabled();
    await machine.getByLabel("Marca macchina manuale").fill("Unità idronica");
    await machine
      .getByLabel("Modello macchina manuale")
      .fill("Canalizzato ad acqua");
    await machine.getByLabel("Portata massima macchina manuale").fill("900");
    for (const [label, value] of [
      ["Larghezza", "900"],
      ["Altezza", "250"],
      ["Profondità", "700"],
    ])
      await machine
        .getByLabel(`${label} macchina (mm)`, { exact: true })
        .fill(value);
    await machine.getByLabel("Marca macchina manuale").fill("   ");
    await machine.getByRole("button", { name: "Salva", exact: true }).click();
    const toast = page.locator(".notifica-toast[role=alert]");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Marca, modello e portata");
    await page.screenshot({ path: `.cache/toast-modal-${width}.png` });
    await toast
      .getByRole("button", { name: "Chiudi errore" })
      .click({ timeout: 3000 });
    await expect(toast).toHaveCount(0);
    await machine.getByLabel("Marca macchina manuale").fill("Unità idronica");
    await machine.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(machine).toHaveCount(0);
    await expect(plan.getByTestId("draft-machine")).toHaveCount(0);
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await plan.getByTestId("draft-terminal").click();
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(1);
    const terminal = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
      exact: true,
    });
    await expect(terminal).toBeVisible();
    await terminal
      .getByRole("button", { name: "Scegli EDLS", exact: true })
      .click();
    await pickTerminalLength(terminal, 1000);
    await openDisclosure(terminal, "Aspetto e finiture facoltativi");
    await terminal
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
      .click();
    await terminal
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(terminal).toHaveCount(0);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await plan.getByTestId("draft-heatPump").click();
    const pump = page.getByRole("dialog", {
      name: "Scegli pompa di calore",
      exact: true,
    });
    await expect(pump).toBeVisible();
    await pump.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(pump).toHaveCount(0);
    await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await page.reload();
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await expect(plan.getByTestId("heat-pump-2d")).toHaveCount(1);
  });
