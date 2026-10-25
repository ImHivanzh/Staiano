import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

const historical = JSON.parse(
  readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
);
const index = JSON.parse(
  readFileSync("catalog-data/generated/catalog-history-index.json", "utf8"),
);
const asset =
  index.catalogs.airTerminals[historical.airTerminals[0].catalogVersion];

test("current projects load no archives; historical import and reload retain exact revisions", async ({
  page,
}) => {
  test.setTimeout(60000);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/catalog-history/"))
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Avvia wizard", exact: true }),
  ).toBeEnabled();
  expect(requests).toEqual([]);
  await page
    .getByTestId("project-file")
    .setInputFiles({
      name: "historical.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(historical)),
    });
  await expect(
    page.getByRole("heading", { name: historical.name, exact: true }),
  ).toBeVisible();
  expect(requests.some((url) => url.endsWith(asset.file))).toBe(true);
  expect(new Set(requests).size).toBe(requests.length);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: historical.name, exact: true }),
  ).toBeVisible();
  await openDisclosure(page, "File");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const saved = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(
    saved.airTerminals.map(
      (item: { catalogVersion: string }) => item.catalogVersion,
    ),
  ).toEqual(
    historical.airTerminals.map(
      (item: { catalogVersion: string }) => item.catalogVersion,
    ),
  );
  expect(
    saved.radiators.map(
      (item: { catalogVersion: string }) => item.catalogVersion,
    ),
  ).toEqual(
    historical.radiators.map(
      (item: { catalogVersion: string }) => item.catalogVersion,
    ),
  );
});

test.describe("historical asset unavailable", () => {
  test.use({
    expectedHttpError: { status: 503, path: `/catalog-history/${asset.file}` },
  });
  test("rejects import without replacing the project already open", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Disegna manualmente" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Crea stanza", exact: true })
      .click();
    const name = await page.getByRole("heading", { level: 1 }).innerText();
    await page.route(`**/catalog-history/${asset.file}`, (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page
      .getByTestId("project-file")
      .setInputFiles({
        name: "historical.hvacproj",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(historical)),
      });
    await expect(
      page.getByRole("alert").filter({ hasText: "Catalogo storico" }),
    ).toContainText("non disponibile");
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".nome-stanza")).toHaveCount(1);
  });
});
