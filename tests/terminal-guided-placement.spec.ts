import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import {
  chooseTerminalModel,
  openInspector,
  openDisclosure,
} from "./ui-helpers";
import { projectSchema, type Project } from "../src/schemas/project";

const fixture = JSON.parse(
  readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
).empty as Project;
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`guided vent: configure, cancel, move and confirm at ${viewport.width}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    const initial = structuredClone(fixture);
    initial.hvacSystems[0].airflowM3h = 900;
    initial.hvacSystems[0].genericMachine!.maxAirflowM3h = 900;
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "vents.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(initial)),
    });
    await page
      .getByRole("button", { name: "Continua liberamente nell’editor" })
      .click();
    await page.locator(".stanza-pianta").first().click();
    await openInspector(page, "Configura impianto");
    const config = page.getByRole("dialog", {
      name: "Configura impianto",
      exact: true,
    });
    const panel = config.getByRole("region", {
      name: "Bocchette della stanza",
    });
    await expect(panel).toContainText("Restano 900 m³/h");
    await expect(panel.getByRole("img")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Continua con il modello" }),
    ).toBeDisabled();
    await chooseTerminalModel(config, "EDLS");
    await config.getByLabel("Numero di feritoie").selectOption("2");
    await config.getByLabel("Montaggio terminale").selectOption("ceiling");
    await config
      .getByLabel("Lunghezza singola bocchetta", { exact: true })
      .fill("1000");
    await config.getByLabel("Finitura scelta").fill("RAL9016");
    const capacityText = await config
      .getByText(/^Portata di questa bocchetta:/)
      .innerText();
    const capacity = Number(
      capacityText
        .match(/: ([\d.,]+) m³/)![1]
        .replace(/\./g, "")
        .replace(",", "."),
    );
    await config.screenshot({ path: info.outputPath("guided-settings.png") });
    await config
      .getByRole("button", { name: "Posiziona nell’ambiente" })
      .click();
    const placement = page.getByRole("dialog", {
      name: "Posiziona bocchetta",
      exact: true,
    });
    await expect(
      placement.getByRole("button", { name: "Conferma posizione" }),
    ).toBeDisabled();
    await expect(panel).toContainText("Restano 900 m³/h");
    await page.keyboard.press("Escape");
    await expect(placement).toHaveCount(0);
    await expect(page.getByTestId("terminal-supply")).toHaveCount(0);
    await config
      .getByRole("button", { name: "Posiziona nell’ambiente" })
      .click();
    await placement.getByLabel("Adatta planimetria").click();
    const svg = placement.getByTestId("editor-2d");
    const points = await svg.evaluate((node) => {
      const matrix = (node as SVGSVGElement).getScreenCTM()!;
      return [
        { x: 3, y: 3 },
        { x: 5, y: 3 },
      ].map((point) => {
        const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
        return { x: screen.x, y: screen.y };
      });
    });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
    await page.mouse.up();
    await expect(
      placement.getByRole("button", { name: "Conferma posizione" }),
    ).toBeEnabled();
    await expect(panel).toContainText("Restano 900 m³/h");
    await placement.screenshot({
      path: info.outputPath("guided-position.png"),
    });
    await placement.getByRole("button", { name: "Conferma posizione" }).click();
    await expect(placement).toHaveCount(0);
    await expect(panel).toContainText(`Restano ${900 - capacity} m³/h`);
    await expect(
      panel
        .getByText(`Restano ${900 - capacity} m³/h`, { exact: false })
        .first(),
    ).toBeInViewport();
    await expect(
      panel.getByRole("button", { name: "Aggiungi un’altra bocchetta" }),
    ).toBeVisible();
    await config.getByRole("button", { name: "Chiudi configurazione" }).click();
    const download = page.waitForEvent("download");
    await openDisclosure(page, "File");
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const project = projectSchema.parse(
      JSON.parse(readFileSync((await (await download).path())!, "utf8")),
    );
    expect(project.airTerminals).toHaveLength(1);
    expect(project.airTerminals[0]).toMatchObject({
      finish: "RAL9016",
      widthMm: 1000,
      availableAirflowM3h: capacity,
    });
    expect(
      Math.abs(project.airTerminals[0].position.x - 5),
    ).toBeLessThanOrEqual(0.11);
    expect(
      Math.abs(project.airTerminals[0].position.y - 3),
    ).toBeLessThanOrEqual(0.11);
    expect(project.airTerminals[0].productId).toContain("2f");
    await page.reload();
    await expect(page.getByTestId("terminal-supply")).toHaveCount(1);
  });
}
