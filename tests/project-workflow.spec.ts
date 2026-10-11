import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { openDisclosure, openInspector } from "./ui-helpers";

test("archive searches case-insensitively, sorts names, and explains empty results", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const name of ["Zeta appartamento", "Alfa negozio"]) {
    const project = JSON.parse(
      readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
    );
    project.id = crypto.randomUUID();
    project.name = name;
    await page.getByTestId("project-file").setInputFiles({
      name: "archive.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Progetti locali", exact: true })
    .click();
  await expect(page.locator(".progetto-voce")).toHaveCount(2);
  await page.getByLabel("Ordina progetti").selectOption("name");
  await expect(page.locator(".progetto-voce").first()).toContainText(
    "Alfa negozio",
  );
  await page.getByLabel("Cerca progetto").fill("  ZETA  ");
  await expect(page.locator(".progetto-voce")).toHaveCount(1);
  await expect(page.locator(".progetto-voce")).toContainText(
    "Zeta appartamento",
  );
  await page.getByLabel("Cerca progetto").fill("inesistente");
  await expect(
    page.getByText("Nessun progetto corrisponde alla ricerca."),
  ).toBeVisible();
  await page.getByLabel("Cerca progetto").fill("");
  await expect(page.locator(".progetto-voce")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("archive-mobile.png"),
    fullPage: true,
  });
});

async function roomHeight(page: Page, value: string) {
  await page.getByRole("button", { name: /^Soggiorno/ }).click();
  await openInspector(page, "Modifica stanza");
  await page.getByLabel("Altezza stanza", { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Applica proprietà", exact: true })
    .click();
}

for (const recovery of ["copy", "reload"] as const) {
  test(`two tabs preserve the saved project and recover the conflicting draft with ${recovery}`, async ({
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
    const second = await page.context().newPage();
    await second.goto("/");
    await expect(second.getByTestId("save-status")).toHaveText("Salvato");
    await roomHeight(page, "2.9");
    await expect(page.getByTestId("save-status")).toHaveText("Salvato");
    await roomHeight(second, "3.1");
    await expect(second.getByTestId("save-status")).toHaveText("Non salvato");
    await expect(second.locator(".errore-app")).toContainText(
      "un’altra scheda",
    );
    await second.screenshot({
      path: info.outputPath(`conflict-${recovery}.png`),
      fullPage: true,
    });
    if (recovery === "copy") {
      await second
        .getByRole("button", { name: "Salva copia delle mie modifiche" })
        .click();
      await expect(
        second.getByRole("heading", {
          name: "Nuovo progetto — copia locale",
          exact: true,
        }),
      ).toBeVisible();
    } else {
      second.once("dialog", (dialog) => dialog.accept());
      await second
        .getByRole("button", { name: "Carica versione archivio" })
        .click();
    }
    await expect(second.getByTestId("save-status")).toHaveText("Salvato");
    await expect(second.locator(".errore-app")).toHaveCount(0);
    const download = second.waitForEvent("download");
    await openDisclosure(second, "File");
    await second.getByRole("button", { name: "Esporta", exact: true }).click();
    const saved = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(saved.rooms[0].heightM).toBe(recovery === "copy" ? 3.1 : 2.9);
    await second
      .getByRole("button", { name: "Progetti locali", exact: true })
      .click();
    await expect(second.locator(".progetto-voce")).toHaveCount(
      recovery === "copy" ? 2 : 1,
    );
    await second.close();
  });
}
