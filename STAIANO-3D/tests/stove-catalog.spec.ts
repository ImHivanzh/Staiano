import { expect, test } from "./browser-test";

test("catalogo stufe: marchio, tecnologia, modello, foto e finiture ufficiali", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Cataloghi tecnici", exact: true })
    .click();
  const catalog = page.getByRole("region", {
    name: "Catalogo stufe",
    exact: true,
  });
  await expect(catalog).toContainText("170 modelli");
  await catalog.getByRole("button", { name: /^Ravelli/ }).click();
  await catalog.getByRole("button", { name: /^Pellet · Convezione/ }).click();
  await catalog.getByLabel("Cerca modello").fill("Flexi 7");
  await catalog.getByRole("button", { name: /^Flexi 7/ }).click();
  const photo = catalog.getByRole("img", {
    name: "Ravelli Flexi 7",
    exact: true,
  });
  await expect(photo).toBeVisible();
  await expect(photo).toHaveJSProperty("naturalWidth", 440);
  await expect(catalog.getByRole("region", { name: "Dati tecnici verificati" })).toBeVisible();
  await expect(catalog.getByText("Ingombro nominale (L × H × P)", { exact: true })).toBeVisible();
  await expect(catalog.getByText("530 × 1050 × 570 mm", { exact: true })).toBeVisible();
  await expect(catalog.getByText("Potenza nominale", { exact: true })).toBeVisible();
  const finishes = catalog.getByRole("group", {
    name: "Finitura del produttore",
    exact: true,
  });
  await finishes.getByRole("button", { name: "Nero", exact: true }).click();
  await expect(
    finishes.getByRole("button", { name: "Nero", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(catalog.getByRole("status")).toContainText(
    "Finitura scelta: Nero",
  );
  await expect(
    catalog.getByRole("link", { name: /Scheda ufficiale/ }),
  ).toHaveAttribute("href", "https://ita.ravelligroup.it/prodotto/flexi-7/");
  await catalog.getByRole("button", { name: "Marchi", exact: true }).click();
  await catalog.getByRole("button", { name: /^La Nordica Extraflame/ }).click();
  await catalog.getByRole("button", { name: /^Pellet · Ventilata/ }).click();
  await catalog.getByLabel("Cerca modello").fill("AMIKA AD");
  await catalog.getByRole("button", { name: /^AMIKA AD/ }).click();
  await expect(
    catalog.getByRole("img", {
      name: "La Nordica Extraflame AMIKA AD",
      exact: true,
    }),
  ).toBeVisible();
  await catalog
    .getByRole("group", { name: "Finitura del produttore", exact: true })
    .getByRole("button", { name: "Nero", exact: true })
    .click();
  await expect(catalog.getByRole("status")).toContainText(
    "Finitura scelta: Nero",
  );
});

test("vista cliente mostra le stufe anche senza un progetto aperto", async ({
  page,
}) => {
  await page.goto("/cliente");
  await page
    .getByRole("button", { name: "Catalogo stufe", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Catalogo stufe", exact: true }),
  ).toBeVisible();
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Mostra progetto", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Catalogo stufe", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Apri “Vista cliente” dal configuratore.", { exact: false }),
  ).toBeVisible();
});
