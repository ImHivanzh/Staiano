import { expect, test } from "./browser-test";
import { openInspector, openDisclosure } from "./ui-helpers";
test("canalizzato, mandata/ripresa reali, reload e selezione3D", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  await page
    .getByRole("group", { name: "Impianto da configurare" })
    .getByRole("button", { name: "Canalizzato", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Scegli macchina", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configura canalizzato", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "PEAD-M35JA2", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Punti mandata", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Stile supply EDLS", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Applica mandata e posiziona", exact: true })
    .click();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(2);
  await page.getByRole("button", { name: "Ripresa", exact: true }).click();
  await page
    .getByRole("button", { name: "Stile return EGQ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Applica ripresa e posiziona", exact: true })
    .click();
  await expect(page.getByTestId("terminal-return")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("terminal-supply")).toHaveCount(2);
  await expect(page.getByTestId("terminal-return")).toHaveCount(1);
  await page.getByTestId("terminal-supply").first().click();
  await openInspector(page, "Posizione");
  await expect(
    page.getByRole("button", { name: "Applica posizione terminale" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({ path: "test-results/ducted-3d.png", fullPage: true });
  await page
    .getByRole("button", { name: "Controlli", exact: false })
    .first()
    .click();
  await expect(page.locator(".controllo.invalid")).toHaveCount(0);
});
test("gallery Ecoclima reale, scelta stile e formula metri lineari", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Cataloghi tecnici", exact: true })
    .click();
  await page.getByLabel("Portata richiesta (m³/h)").fill("480");
  await page.getByLabel("Numero punti", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Trova stili compatibili" }).click();
  await expect(
    page.getByRole("button", { name: "Scegli EDLS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scegli EBLF", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scegli EDLS", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "EDLS: misure compatibili" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Teorica", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Misura commerciale", exact: true }),
  ).toBeVisible();
  const firstOfficialPhoto = page.locator(".stile-terminale img").first();
  await firstOfficialPhoto.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      firstOfficialPhoto.evaluate(
        (node) => (node as HTMLImageElement).naturalWidth,
      ),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/ecoclima-gallery.png",
    fullPage: true,
  });
});
test("radiatori reali, vincoli, posizionamento e reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Configura impianto");
  await page.getByLabel("Marca radiatori").selectOption("Global");
  await page.getByLabel("Famiglia radiatori").selectOption("VIP");
  await page.getByLabel("Numero radiatori").fill("2");
  await page
    .getByRole("button", { name: "Trova radiatori compatibili" })
    .click();
  const solution = page.locator(".soluzione-radiatore").first();
  await expect(solution).toContainText("VIP");
  await expect(solution).toContainText("2 radiatori");
  await solution.getByRole("button", { name: "Applica e posiziona" }).click();
  await expect(page.getByTestId("radiator-2d")).toHaveCount(2);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("radiator-2d")).toHaveCount(2);
  await page.getByRole("button", { name: /Soggiorno.*15,96/ }).click();
  await openInspector(page, "Configura impianto");
  await expect(page.getByLabel("Marca radiatori", { exact: true })).toHaveValue(
    "Global",
  );
  await expect(
    page.getByLabel("Famiglia radiatori", { exact: true }),
  ).toHaveValue("VIP");
  await expect(
    page.getByLabel("Numero radiatori", { exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Chiudi configurazione" }).click();
  await page.getByTestId("radiator-2d").first().click();
  await openInspector(page, "Posizione");
  await expect(page.getByText("Distanza centro dall'inizio (m)")).toBeVisible();
  await page
    .getByRole("button", { name: "Controlli", exact: false })
    .first()
    .click();
  await page.getByLabel("Esito controlli").selectOption("all");
  await expect(page.getByText(/resa da formula produttore/)).toHaveCount(2);
  await expect(page.locator(".controllo.invalid")).toHaveCount(0);
});

test("creazione manuale, quote, altezza, autosave, import/export e 3D", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Nome ambiente" })
    .fill("Soggiorno Rossi");
  await dialog
    .getByRole("spinbutton", { name: "Larghezza netta (m)" })
    .fill("5");
  await dialog
    .getByRole("spinbutton", { name: "Lunghezza netta (m)" })
    .fill("4");
  await dialog
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await expect(page.getByTestId("room-area")).toContainText("20,00");
  await expect(page.getByTestId("room-load")).toContainText("1,89");
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await openInspector(page, "Modifica stanza");
  await page
    .getByRole("spinbutton", { name: "Altezza stanza", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Applica proprietà" }).click();
  await expect(page.getByTestId("room-load")).toContainText("2,10");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await page.getByRole("button", { name: /Soggiorno Rossi.*20,00/ }).click();
  await expect(page.getByTestId("room-load")).toContainText("2,10");
  await openInspector(page, "Modifica stanza");
  await page.getByRole("spinbutton", { name: "Larghezza netta (m)" }).fill("6");
  await page.getByRole("button", { name: "Aggiorna quote nette" }).click();
  await expect(page.getByTestId("room-area")).toContainText("24,00");
  await openDisclosure(page, "Modifica");
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await page.getByRole("button", { name: /Soggiorno Rossi.*20,00/ }).click();
  await expect(page.getByTestId("room-area")).toContainText("20,00");
  await openDisclosure(page, "Modifica");
  await page.getByRole("button", { name: "Ripeti", exact: true }).click();
  await page.getByRole("button", { name: /Soggiorno Rossi.*24,00/ }).click();
  await expect(page.getByTestId("room-area")).toContainText("24,00");
  const downloadPromise = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.hvacproj$/);
  const path = testInfo.outputPath("roundtrip.hvacproj");
  await download.saveAs(path);
  await page.getByTestId("project-file").setInputFiles(path);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "importato",
  );
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({ path: "test-results/manual-3d.png", fullPage: true });
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await page.getByRole("button", { name: "Vista dall'alto" }).click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("editor-2d")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: /Soggiorno Rossi.*24,00/ }).click();
  await page.screenshot({
    path: "test-results/manual-1440.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("input errato preserva progetto, archivio duplica e recupera autosave", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await openInspector(page, "Modifica stanza");
  await page
    .getByRole("textbox", { name: "Nome stanza", exact: true })
    .fill("Camera aggiornata");
  await page.getByRole("button", { name: "Applica proprietà" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.getByTestId("project-file").setInputFiles({
    name: "errato.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":999}'),
  });
  await expect(page.locator(".errore-app")).toContainText(
    "Versione progetto non supportata",
  );
  await expect(page.getByTestId("wall")).toHaveCount(4);
  await page.getByRole("button", { name: "Progetti locali" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Recupera autosave" }).click();
  await expect(
    page.getByRole("button", { name: /Soggiorno.*15,96/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progetti locali" }).click();
  page.once("dialog", (d) => d.accept("Casa duplicata"));
  await page.getByRole("button", { name: "Duplica", exact: true }).click();
  await expect(page.getByText("Casa duplicata", { exact: true })).toBeVisible();
});

test("responsive 800 px, contorni liberi e piani", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("button", { name: "Chiudi stanza rettangolare" })
    .click();
  await page.getByRole("button", { name: "Disegna muro", exact: true }).click();
  const svg = page.getByTestId("editor-2d"),
    box = await svg.boundingBox();
  if (!box) throw new Error("Editor assente");
  const points = [
    [0.24, 0.32],
    [0.7, 0.32],
    [0.7, 0.72],
    [0.44, 0.82],
    [0.24, 0.72],
    [0.24, 0.32],
  ];
  for (const [x, y] of points)
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("wall")).toHaveCount(5);
  await expect(page.locator(".nome-stanza")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/manual-800.png",
    fullPage: true,
  });
});
