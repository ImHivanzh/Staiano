import { chooseTerminalModel, pickPlanPoint } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";
import { execFileSync } from "node:child_process";

test("customer view shows graphical connection pipes, saved plenums and air flows live", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import { guidedProjectFixture, guidedTerminalPoint } from './tests/guided-fixture.ts';
    import { placeMachineOnPlan, saveTerminalOnPlan, connectTerminalOnPlan } from './src/domain/ducted/graphic-installation.ts';
    import { placeSupplyPlenum } from './src/domain/ducted/placement.ts';
    let p = guidedProjectFixture();
    const systemId = p.hvacSystems[0].id;
    p = placeMachineOnPlan(p, systemId, p.rooms[0].id, { x: 2, y: 4 });
    p = saveTerminalOnPlan(p, { ...guidedTerminalPoint(), roomId: p.rooms[0].id, systemId, color: 'RAL9016', use: 'supply', mounting: 'ceiling', lengthMm: 1000 }, { x: 4, y: 2 });
    p = connectTerminalOnPlan(p, p.airTerminals[0].id, systemId);
    console.log(JSON.stringify(placeSupplyPlenum(p, systemId)));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "client-air.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Apri vista cliente", exact: true })
    .click();
  const client = await opened;
  const errors: string[] = [];
  client.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1920, 1024]) {
    await client.setViewportSize({
      width,
      height: width === 1920 ? 1080 : 768,
    });
    const canvas = client.locator("canvas");
    await expect(canvas).toHaveAttribute("data-air-connections", "1", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-plenum-count", "1");
    await expect(canvas).toHaveAttribute("data-comfort-mode", "cool");
    await expect
      .poll(async () =>
        Number(await canvas.getAttribute("data-comfort-streams")),
      )
      .toBeGreaterThan(0);
    await client.screenshot({
      path: info.outputPath(`customer-air-${width}.png`),
    });
  }
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  expect(
    await plan.getByTestId("air-connection").evaluate((node) => {
      const terminal = node
        .closest("svg")!
        .querySelector('[data-testid="terminal-supply"]')!;
      return !!(
        node.compareDocumentPosition(terminal) &
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await plan.getByTestId("terminal-supply").click();
  await page.keyboard.press("Escape");
  await plan.locator('summary[aria-label="Azioni bocchetta"]').click();
  await plan.getByRole("button", { name: "Scollega", exact: true }).click();
  await expect(client.locator("canvas")).toHaveAttribute(
    "data-air-connections",
    "0",
  );
  await page.keyboard.press("Control+z");
  await expect(client.locator("canvas")).toHaveAttribute(
    "data-air-connections",
    "1",
  );
  expect(errors).toEqual([]);
  await client.close();
});

test("separate customer window receives edits and undo without exposing editor controls", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Apri vista cliente", exact: true })
    .click();
  const client = await opened;
  const errors: string[] = [];
  client.on("pageerror", (error) => errors.push(error.message));
  await client.setViewportSize({ width: 1920, height: 1080 });
  await expect(client.getByRole("status")).toHaveText("Aggiornamento live");
  await expect(client.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );
  await expect(
    client.getByText("Aggiungi apparecchio", { exact: true }),
  ).toHaveCount(0);
  await expect(
    client.getByText("Configura impianto", { exact: true }),
  ).toHaveCount(0);
  await expect(client.locator(".proprieta")).toHaveCount(0);
  await openDisclosure(page, "File");
  page.once("dialog", (dialog) => dialog.accept("Progetto TV live"));
  await page
    .getByRole("button", { name: "Rinomina progetto", exact: true })
    .click();
  await expect(client.getByRole("heading", { level: 1 })).toHaveText(
    "Progetto TV live",
  );
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.keyboard.press("Control+z");
  await expect(client.getByRole("heading", { level: 1 })).not.toHaveText(
    "Progetto TV live",
  );
  await client
    .getByRole("button", { name: "Schermo intero", exact: true })
    .click();
  await expect
    .poll(() => client.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await client.evaluate(() => document.exitFullscreen());
  await client.screenshot({
    path: ".impeccable/review/customer-view/desktop.png",
  });
  await client.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(() =>
      client.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await client.screenshot({
    path: ".impeccable/review/customer-view/ipad.png",
  });
  await client.close();
  await page.keyboard.press("Escape");
  const reopened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Apri vista cliente", exact: true })
    .click();
  const second = await reopened;
  await expect(second.getByRole("status")).toHaveText("Aggiornamento live");
  await page.reload();
  await expect(second.getByRole("status")).toContainText("scollegato");
  await second.close();
  expect(errors).toEqual([]);
});

test("guided return offers EGA 6 Push and all sizes, disabling supply-only families", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  const popup = page.getByRole("dialog", {
    name: /^(?:Vista |Configura impianto$)/,
    exact: true,
  });
  await popup.getByRole("button", { name: "Canalizzato", exact: true }).click();
  await popup
    .getByRole("button", { name: "Apri planimetria operativa" })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan
    .getByRole("group", { name: "Funzione bocchetta", exact: true })
    .getByRole("button", { name: "Ripresa", exact: true })
    .click();
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 2, 2);
  await plan.getByTestId("draft-terminal").click();
  const terminalPopup = page.getByRole("dialog", {
    name: "Scegli bocchetta sul punto",
  });
  await terminalPopup
    .getByRole("button", { name: "Ripresa", exact: true })
    .click();
  await expect(
    terminalPopup.getByRole("group", { name: "Bocchette principali" }),
  ).toContainText("EGA6 Push");
  await expect(
    terminalPopup
      .getByRole("group", { name: "Bocchette principali" })
      .getByRole("button", { name: "Scegli EDLS", exact: true }),
  ).toHaveCount(0);
  await chooseTerminalModel(terminalPopup, "EGA6");
  await expect(
    terminalPopup.getByRole("heading", { name: "Modello · EGA6" }),
  ).toBeVisible();
  const sizes = terminalPopup.getByRole("group", {
    name: "Soluzione terminale",
    exact: true,
  });
  await expect(sizes).toContainText("1000 × 200 mm");
  await expect(sizes).toContainText("600 × 600 mm");
  await sizes
    .getByRole("button", { name: "600 × 600 mm", exact: true })
    .click();
  await terminalPopup.getByLabel("Larghezza faccia dichiarata").fill("600");
  await terminalPopup.getByLabel("Altezza faccia dichiarata").fill("600");
  await terminalPopup
    .getByLabel("Colore scelto", { exact: true })
    .fill("RAL9016");
  await terminalPopup
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(plan.getByTestId("terminal-return")).toHaveCount(1);
  await plan.getByTestId("terminal-return").click();
  const edited = page.getByRole("dialog", {
    name: "Configura bocchetta",
    exact: true,
  });
  await expect(edited.getByLabel("Larghezza faccia dichiarata")).toHaveValue(
    "600",
  );
  await expect(edited.getByLabel("Altezza faccia dichiarata")).toHaveValue(
    "600",
  );
  await edited
    .locator("footer")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Torna all’editor", exact: true })
    .click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Apri vista cliente", exact: true })
    .click();
  const customer = await opened;
  await customer.setViewportSize({ width: 1920, height: 1080 });
  await expect(customer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
    { timeout: 30000 },
  );
  await expect(customer.locator("footer")).toContainText(
    "Impianto 1 · Canalizzato",
  );
  await expect(customer.locator("canvas")).toHaveAttribute(
    "data-cut-walls",
    /^[1-9]\d*$/,
  );
  await customer.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await customer.screenshot({
    path: ".impeccable/review/customer-view/model-devices.png",
  });
  await customer.setViewportSize({ width: 1024, height: 768 });
  await customer.screenshot({
    path: ".impeccable/review/customer-view/model-devices-ipad.png",
  });
  await customer.close();
});
