import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import {
  chooseTerminalModel,
  openDisclosure,
  pickTerminalLength,
} from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

test.describe("tablet touch", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 768 },
  });
  test("places, configures and manually connects a terminal using touch", async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "touch.hvacproj",
      mimeType: "application/json",
      buffer: readFileSync("tests/fixtures/unconfigured-connections.json"),
    });
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).tap();
    const editor = plan.getByTestId("editor-2d");
    const point = await editor.evaluate((node) => {
      const at = new DOMPoint(4, 3).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      const box = node.getBoundingClientRect();
      return { x: at.x - box.left, y: at.y - box.top };
    });
    await editor.tap({ position: point });
    await expect(plan.getByTestId("draft-terminal")).toHaveCount(2);
    await plan.getByRole("button", { name: "Collega", exact: true }).tap();
    await plan.getByTestId("draft-machine").tap();
    await plan.getByTestId("draft-terminal").last().tap();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-machine").tap();
    const machine = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await machine
      .getByRole("button", { name: "Dati manuali", exact: true })
      .tap();
    await machine.getByLabel("Marca macchina manuale").fill("Macchina touch");
    await machine.getByLabel("Modello macchina manuale").fill("Touch 900");
    await machine.getByLabel("Portata massima macchina manuale").fill("900");
    for (const [name, value] of [
      ["width", "900"],
      ["height", "250"],
      ["depth", "700"],
    ])
      await machine.locator(`input[name="${name}"]`).fill(value);
    await machine
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .tap();
    await expect(machine).toHaveCount(0);
    await plan.getByTestId("draft-terminal").last().tap();
    const picker = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
      exact: true,
    });
    await chooseTerminalModel(picker, "EDLS");
    await pickTerminalLength(picker, 1000);
    await picker
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
      .tap();
    await picker
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .tap();
    await expect(picker).toHaveCount(0);
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await expect(plan.getByTestId("air-connection")).toHaveCount(1);
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).tap();
    const saved = projectSchema.parse(
      JSON.parse(readFileSync((await (await download).path())!, "utf8")),
    );
    expect(saved.airTerminals[0].widthMm).toBe(1000);
    expect(saved.airTerminals[0].systemId).toBe(saved.hvacSystems[0].id);
    expect(saved.plenums).toEqual([]);
    await page.reload();
    await expect(plan.getByTestId("terminal-supply")).toHaveCount(1);
    await expect(plan.getByTestId("air-connection")).toHaveCount(1);
    await plan.screenshot({ path: info.outputPath("touch-plan.png") });
  });
});
