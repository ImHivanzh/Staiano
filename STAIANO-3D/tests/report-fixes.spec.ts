import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";

test.describe("shared archive failure", () => {
  test.use({ expectedHttpError: { status: 503, path: "/api/projects" } });
  test("shows unavailability and retries without claiming shared projects were deleted", async ({
    page,
  }) => {
    let available = false;
    await page.route("**/api/projects", (route) =>
      route.fulfill({
        status: available ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify(
          available
            ? { projects: [], users: [] }
            : { message: "Archivio condiviso non disponibile." },
        ),
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Progetti", exact: true }).click();
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "Archivio condiviso non disponibile" });
    await expect(alert).toContainText("non sono stati cancellati");
    await page.screenshot({
      path: ".cache/report-fixes/archive-offline-desktop.png",
    });
    available = true;
    await alert.getByRole("button", { name: "Riprova", exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(
      page.getByText("Nessun progetto salvato.", { exact: true }),
    ).toBeVisible();
  });
});

test("wizard links a check to its object and preserves the final review step", async ({
  page,
}) => {
  const project = JSON.parse(
    readFileSync("tests/fixtures/radiator-wizard.hvacproj", "utf8"),
  );
  project.floors[0].configurationWizard = {
    step: 10,
    status: "active",
    confirmedSteps: [0],
  };
  project.rooms[0].name = "";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "check-target.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const wizard = page.getByRole("region", {
    name: "Configurazione guidata",
    exact: true,
  });
  await expect(wizard).toContainText("Passo 5 di 5");
  await wizard
    .locator("li")
    .filter({ hasText: "nome" })
    .getByRole("button", { name: "Mostra nel progetto" })
    .first()
    .click();
  await expect(
    page
      .locator(".proprieta")
      .getByRole("heading", { name: "Stanza senza nome", level: 2 }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome stanza", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Torna alla verifica guidata", exact: true })
    .click();
  await expect(wizard).toContainText("Passo 5 di 5");
  await expect(wizard).toContainText("non certifica il progetto");
  await page.screenshot({
    path: ".cache/report-fixes/wizard-check-desktop.png",
  });
});
