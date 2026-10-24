import { expect, test } from "./browser-test";
import { readFileSync } from "node:fs";
import { openDisclosure } from "./ui-helpers";

test("verified geometry still requires an installation and checks open the relevant properties", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await expect(page.locator(".stato-salvataggio")).toContainText(
    "su questo dispositivo",
  );
  await expect(page.getByTestId("project-progress")).toContainText(
    "Geometria verificata",
  );
  await expect(page.getByTestId("project-progress")).toContainText(
    "Impianti da completare: 1",
  );
  await page.getByRole("button", { name: "Mostra proprietà" }).click();
  await page.getByRole("button", { name: /^Controlli/ }).click();
  const issue = page
    .locator(".controllo")
    .filter({ hasText: "systemConfiguration" });
  await expect(page.locator(".controllo.valid")).toHaveCount(0);
  await page.getByLabel("Esito controlli").selectOption("all");
  await expect(page.locator(".controllo.valid").first()).toBeVisible();
  await page.getByLabel("Esito controlli").selectOption("invalid");
  await expect(
    page.getByText("Nessun controllo corrisponde ai filtri selezionati."),
  ).toBeVisible();
  await page.getByLabel("Esito controlli").selectOption("warning");
  await expect(issue).toContainText("impianto da completare");
  await page.screenshot({
    path: info.outputPath("checks-desktop.png"),
    fullPage: true,
  });
  await issue.getByRole("button", { name: "Mostra nel progetto" }).click();
  await expect(page.locator("#proprieta-progetto")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Macchina", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".proprieta")).toContainText("Soggiorno");
  await page.reload();
  await expect(page.getByTestId("project-progress")).toContainText(
    "Impianti da completare: 1",
  );
  await openDisclosure(page, "File");
  await expect(
    page.getByText("I progetti restano nel browser di questo dispositivo.", {
      exact: false,
    }),
  ).toBeVisible();
});

test("opening warning navigates to its wall on another floor at phone width", async ({
  page,
}, info) => {
  const project = JSON.parse(
    readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
  );
  const upstairs = { ...project.floors[0], name: "Piano primo" };
  project.floors = [
    { ...upstairs, id: crypto.randomUUID(), name: "Piano terra" },
    upstairs,
  ];
  project.openings[0].type = "window";
  project.openings[0].sillHeightM = 0.9;
  project.openings[0].heightM = 4;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "two-floors.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByLabel("Piano attivo su schermo ridotto")).toHaveValue(
    project.floors[0].id,
  );
  await page.getByRole("button", { name: /^Controlli/ }).click();
  const issue = page
    .locator(".controllo.invalid")
    .filter({ hasText: "openingDimensions" });
  await expect(issue).toContainText("fuori dall’ingombro");
  await page
    .getByLabel("Piano dei controlli")
    .selectOption(project.floors[0].id);
  await expect(issue).toHaveCount(0);
  await page.getByLabel("Piano dei controlli").selectOption(upstairs.id);
  const room = project.rooms.find((item: { wallIds: string[] }) =>
    item.wallIds.includes(project.openings[0].wallId),
  );
  await page.getByLabel("Ambiente dei controlli").selectOption(room.id);
  await expect(issue).toBeVisible();
  await page.screenshot({
    path: info.outputPath("checks-mobile.png"),
    fullPage: true,
  });
  await issue.getByRole("button", { name: "Mostra nel progetto" }).click();
  await expect(page.getByLabel("Piano attivo su schermo ridotto")).toHaveValue(
    upstairs.id,
  );
  await expect(
    page
      .locator(".proprieta")
      .getByRole("button", { name: "Applica parete", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#proprieta-progetto")).toBeFocused();
  await expect(
    page.locator(".apertura-parete").filter({ hasText: "Finestra" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("check-wall-mobile.png"),
    fullPage: true,
  });
});
