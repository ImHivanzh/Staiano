import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Project } from "../src/schemas/project";

test("saved legacy steps resume in the matching simplified phase", async ({
  page,
}) => {
  const fixture = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).empty as Project;
  await page.goto("/");
  for (const [step, phase] of [
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 2],
    [9, 4],
  ]) {
    await page.getByTestId("project-file").setInputFiles({
      name: `wizard-step-${step}.hvacproj`,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...fixture,
          id: `legacy-wizard-${step}`,
          name: `Ripresa passo ${step}`,
          floors: fixture.floors.map((floor) => ({
            ...floor,
            configurationWizard: {
              step,
              status: "active",
              confirmedSteps: [0],
            },
          })),
        }),
      ),
    });
    await expect(
      page.getByRole("heading", { name: `Ripresa passo ${step}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Configurazione guidata" }),
    ).toContainText(`Passo ${phase} di 5`);
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  }
});

test("wizard has room to read and its controls fit laptop and phone screens", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Avvia wizard", exact: true }).click();
  await page
    .getByRole("button", { name: "Avvia procedura guidata", exact: true })
    .click();
  const wizard = page.getByRole("region", {
    name: "Configurazione guidata",
    exact: true,
  });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const panel = await page.locator("#proprieta-progetto").boundingBox();
    if (width > 640) expect(panel!.width).toBeGreaterThanOrEqual(360);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const bounds = await wizard.boundingBox();
    for (const button of await wizard.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width + 1,
      );
    }
    if (width === 1440 || width === 390) {
      await wizard.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.impeccable/review/wizard-clean-${width}.png`,
      });
    }
    const next = wizard.getByRole("button", { name: "Conferma e continua" });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
  }
  await wizard.getByRole("button", { name: "Disegna una stanza" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await wizard.getByRole("button", { name: "3. Stanze", exact: true }).click();
  await expect(
    wizard.getByRole("heading", { name: "Completa le stanze" }),
  ).toBeFocused();
  await expect(wizard.getByLabel(/^Altezza /)).toBeVisible();
  await wizard.getByLabel(/^Altezza /).fill("3.1");
  await wizard.getByLabel(/^Altezza /).press("Tab");
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(wizard.getByLabel(/^Altezza /)).toHaveValue("3.1");
  await wizard.getByRole("button", { name: /^Quote e vuoti / }).click();
  await expect(
    page.locator(".proprieta").getByRole("heading", { level: 2 }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [number, name] of [
    [2, "Misure"],
    [3, "Stanze"],
    [4, "Impianti"],
    [5, "Verifica"],
  ]) {
    await wizard
      .getByRole("button", { name: `${number}. ${name}`, exact: true })
      .click();
    await page.screenshot({
      path: `.impeccable/review/wizard-phase-${number}.png`,
    });
  }
});

test("wizard starts from the home page and resumes saved progress", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Avvia wizard", exact: true }).click();
  await page
    .getByRole("button", { name: "Avvia procedura guidata", exact: true })
    .click();
  const wizard = page.getByRole("region", {
    name: "Configurazione guidata",
    exact: true,
  });
  await expect(wizard).toBeVisible();
  await expect(wizard).toContainText("Passo 1 di 5");
  await expect(wizard.getByRole("navigation").getByRole("button")).toHaveCount(
    5,
  );
  await expect(
    page.getByText("Seleziona un elemento", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Parti da una stanza", { exact: true }),
  ).toHaveCount(0);
  await wizard
    .getByRole("button", { name: "Importa planimetria", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: /Importa planimetria/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Chiudi importazione", exact: true })
    .click();
  await wizard.getByRole("button", { name: "2. Misure", exact: true }).click();
  await wizard
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Riprendi wizard", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await page
    .getByRole("button", { name: "Riprendi wizard", exact: true })
    .click();
  await expect(wizard).toContainText("Passo 2 di 5");
  await expect(wizard).toBeVisible();
  await page.screenshot({ path: ".impeccable/review/wizard.png" });
});

test("manual projects can start the wizard and 3D tools stay inside task menus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page.getByRole("button", { name: "Mostra proprietà" }).click();
  await page.getByRole("button", { name: "Avvia wizard", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Configurazione guidata" }),
  ).toContainText("Passo 3 di 5");
  await expect(
    page.getByText("Destinazione d’uso", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/^Uso /)).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Configurazione guidata", exact: true })
      .getByLabel(/^Altezza /),
  ).toBeVisible();
  await expect(page.locator("#proprieta-progetto")).toBeVisible();
  await page
    .getByRole("region", { name: "Configurazione guidata", exact: true })
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  await expect(
    page.getByRole("button", { name: "Esporta", exact: true }),
  ).toBeHidden();
  await openDisclosure(page, "File");
  await expect(
    page.getByRole("button", { name: "Esporta", exact: true }),
  ).toBeVisible();
  await openDisclosure(page, "Modifica");
  await expect(page.locator(".azioni-testata details[open]")).toHaveCount(0);
  await expect(page.getByLabel("Elemento nel progetto")).toBeVisible();
  await page.getByLabel("Elemento nel progetto").press("Escape");
  await expect(page.locator(".menu-modifica[open]")).toHaveCount(0);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(
    viewer.getByRole("button", { name: "Radiatori", exact: true }),
  ).toBeHidden();
  await openDisclosure(viewer, "Aggiungi apparecchio");
  await viewer.getByRole("button", { name: "Radiatori", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Inserisci apparecchio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inserisci sulla pianta", exact: true }),
  ).toBeVisible();
  await expect(
    viewer.locator('details[name="viewer-menus"][open]'),
  ).toHaveCount(0);
});

test("workspace menus remain fully inside narrow phone viewports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["File", "Modifica", "Opzioni 2D"]) {
      await openDisclosure(page, name);
      const panel = page.locator(
        'details[name="workspace-menus"][open] > .comandi-progetto',
      );
      await expect(panel).toBeVisible();
      const box = await panel.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(844);
      await page.screenshot({
        path: `.impeccable/review/menu-${width}-${name.replaceAll(" ", "-")}.png`,
      });
      await page
        .locator('details[name="workspace-menus"][open] > summary')
        .press("Escape");
      await expect(panel).toHaveCount(0);
    }
  }
});
