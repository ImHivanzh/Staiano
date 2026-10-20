import { pickTerminalLength } from "./ui-helpers";
import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

for (const width of [1920, 1024]) {
  test(`published finishes show anodized aluminium, the white surcharge and custom RAL at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 1366 });
    const fixture = JSON.parse(
      readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
    ).empty;
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "terminal-finishes.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await page
      .getByRole("button", { name: "Chiudi wizard", exact: true })
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
    await popup
      .getByRole("group", { name: "Funzione delle bocchette" })
      .getByRole("button", { name: "Ripresa", exact: true })
      .click();
    await popup
      .getByRole("button", { name: "Scegli EGA6", exact: true })
      .first()
      .click();
    await expect(
      popup.getByRole("button", {
        name: "Alluminio anodizzato naturale · colore non specificato",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", {
        name: "RAL 9016 · Bianco · +20%",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", {
        name: "RAL a scelta · da quotare",
        exact: true,
      }),
    ).toHaveCount(0);
    await popup.screenshot({
      path: `.cache/terminal-finish-ega6-${width}.png`,
    });
    await popup
      .getByRole("group", { name: "Funzione delle bocchette" })
      .getByRole("button", { name: "Mandata", exact: true })
      .click();
    await popup.getByText("Tutti i modelli Ecoclima", { exact: true }).click();
    await popup
      .getByRole("button", { name: "Scegli EBA", exact: true })
      .click();
    await popup
      .getByRole("button", { name: "RAL a scelta · da quotare", exact: true })
      .click();
    await popup.getByLabel("Codice RAL a scelta").fill("RAL 7035");
    await expect(popup.getByLabel("Codice RAL a scelta")).toHaveValue(
      "RAL7035",
    );
    await expect(
      popup.getByRole("button", { name: /RAL7035.*valore precedente/ }),
    ).toHaveCount(0);
    await expect(popup.getByLabel("Finitura scelta")).toHaveCount(0);
    await popup.screenshot({
      path: `.cache/terminal-finish-custom-ral-${width}.png`,
    });
  });
}

test("terminal requires color, drags without opening a popup, rotates, and wizard toggles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const fixture = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).empty;
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "terminal-movement.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const wizard = page.getByRole("region", {
    name: "Configurazione guidata",
    exact: true,
  });
  const step = await wizard.getByRole("heading").innerText();
  await page
    .getByRole("button", { name: "Chiudi wizard", exact: true })
    .click();
  await expect(wizard).toHaveCount(0);
  await page
    .getByRole("button", { name: "Riprendi wizard", exact: true })
    .click();
  await expect(wizard.getByRole("heading")).toHaveText(step);
  await page
    .getByRole("button", { name: "Chiudi wizard", exact: true })
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
  await popup.getByRole("button", { name: "Scegli EDLS", exact: true }).click();
  await pickTerminalLength(popup, 1000);
  const save = popup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true });
  await expect(popup.getByLabel("Finitura scelta")).toHaveCount(0);
  await expect(
    popup.getByRole("button", { name: "RAL 9005 · Nero", exact: true }),
  ).toBeVisible();
  await save.click();
  await expect(popup.getByRole("alert").first()).toContainText(
    "Scegli il colore",
  );
  await expect(plan.getByTestId("terminal-supply")).toHaveCount(0);
  await popup
    .getByRole("group", { name: "Colore scelto", exact: true })
    .getByRole("button", { name: "RAL 9016 · Bianco", exact: true })
    .click();
  await expect(
    popup
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    popup
      .getByRole("group", { name: "Colore scelto", exact: true })
      .getByRole("button", { name: "RAL 9016 · Bianco", exact: true }),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await popup.screenshot({ path: ".cache/color-buttons-desktop.png" });
  await save.click();
  await expect(popup).toHaveCount(0);
  const terminal = plan.getByTestId("terminal-supply");
  const before = await terminal.getAttribute("transform");
  await plan.getByRole("button", { name: "Muovi (M)", exact: true }).click();
  const canvas = plan.getByTestId("editor-2d");
  await canvas.scrollIntoViewIfNeeded();
  const points = await canvas.evaluate((node) => {
    const matrix = (node as SVGSVGElement).getScreenCTM()!;
    return [new DOMPoint(4, 2), new DOMPoint(5, 3)].map((p) => {
      const screen = p.matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
  });
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  await page.mouse.move(points[1].x, points[1].y, { steps: 10 });
  await page.mouse.up();
  await expect(terminal).not.toHaveAttribute("transform", before!);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const moved = await terminal.getAttribute("transform");
  await plan.getByRole("button", { name: "Ruota 90°", exact: true }).click();
  await expect(terminal).not.toHaveAttribute("transform", moved!);
  const rotation = async () =>
    Number(
      (await terminal.getAttribute("transform"))!.match(
        /rotate\(([^)]+)\)/,
      )![1],
    );
  expect(await rotation()).toBeCloseTo(90);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(terminal).toBeVisible();
  expect(await rotation()).toBeCloseTo(90);
});
