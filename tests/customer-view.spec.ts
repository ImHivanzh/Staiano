import { chooseTerminalModel, confirmTerminalPlacement } from "./ui-helpers";
import { expect, test } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";

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

test("guided return offers EGA 6 Push and all sizes, hiding supply-only families", async ({
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
    name: "Configura impianto",
    exact: true,
  });
  await popup.getByRole("button", { name: "Canalizzato", exact: true }).click();
  await popup
    .getByRole("button", { name: "Scegli macchina", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByLabel("Marca canalizzato").selectOption("Daikin");
  await picker
    .getByRole("button", { name: "Configura canalizzato", exact: true })
    .click();
  await popup.getByRole("button", { name: "Ripresa", exact: true }).click();
  await expect(
    popup.getByLabel("Modello bocchetta", { exact: true }),
  ).toContainText("EGA 6 Push");
  await expect(
    popup
      .getByLabel("Modello bocchetta", { exact: true })
      .locator('option[value="EDLS"]'),
  ).toHaveCount(0);
  await chooseTerminalModel(popup, "EGA6");
  await expect(
    popup.getByRole("heading", { name: "Passo 2 di 3 · EGA6" }),
  ).toBeVisible();
  const sizes = popup.getByLabel("Soluzione terminale");
  await expect(sizes).toContainText("1000 × 200 mm");
  await expect(sizes).toContainText("600 × 600 mm");
  const selected = await sizes
    .locator("option")
    .evaluateAll(
      (options) =>
        (options as HTMLOptionElement[]).find((option) =>
          option.textContent?.includes("600 × 600 mm"),
        )?.value,
    );
  await sizes.selectOption(selected!);
  await expect(
    popup.getByText(/Macchina: .*m³\/h. Griglia scelta:/),
  ).toBeVisible();
  await popup.getByLabel("Larghezza faccia dichiarata").fill("600");
  await popup.getByLabel("Altezza faccia dichiarata").fill("600");
  await popup
    .getByRole("button", { name: "Posiziona nell’ambiente", exact: true })
    .click();
  await confirmTerminalPlacement(page);
  await openDisclosure(popup, "Terminali posizionati");
  await expect(popup).toContainText("Ripresa · EGA6");
  await popup.screenshot({
    path: ".impeccable/review/customer-view/return-selected.png",
  });
  await expect(
    popup
      .getByRole("region", { name: "Bocchette della stanza" })
      .getByRole("img"),
  ).toHaveCount(0);
  await popup.screenshot({
    path: ".impeccable/review/customer-view/return.png",
  });
  await popup.getByRole("button", { name: "Mandata", exact: true }).click();
  await expect(
    popup
      .getByLabel("Modello bocchetta", { exact: true })
      .locator('option[value="EGA6"]'),
  ).toHaveCount(0);
  await expect(
    popup.getByLabel("Modello bocchetta", { exact: true }),
  ).toContainText("EDSC-C");
  await openDisclosure(popup, "Terminali posizionati");
  await popup.getByRole("button", { name: /^Ripresa · EGA6/ }).click();
  const close = popup.getByRole("button", {
    name: "Chiudi configurazione",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  const edit = page.getByRole("region", {
    name: "Modifica bocchetta",
    exact: true,
  });
  await expect(edit.getByLabel("Modello bocchetta")).toHaveValue(
    "ecoclima-ega6-600x600",
  );
  await edit.getByLabel("Finitura", { exact: true }).fill("Bianco scelto");
  await edit
    .getByRole("button", { name: "Applica modifiche bocchetta", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await expect(edit.getByLabel("Finitura", { exact: true })).toHaveValue(
    "Bianco scelto",
  );
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
