import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure } from "./ui-helpers";

async function start(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
}
async function snapshot(page: import("@playwright/test").Page) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const file = await (await waiting).path();
  return projectSchema.parse(JSON.parse(readFileSync(file!, "utf8")));
}

test("manual machine uses the declared maximum, selectable return and original plenum ports", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await start(page);
  const viewer = page.getByTestId("viewer-3d");
  await viewer
    .getByRole("button", { name: "Macchina manuale", exact: true })
    .click();
  const machine = page.getByRole("dialog", { name: "Catalogo macchine" });
  await machine.getByLabel("Marca macchina manuale").fill("Marca dichiarata");
  await machine.getByLabel("Modello macchina manuale").fill("UNITA-900");
  await machine.getByLabel("Portata massima macchina manuale").fill("900");
  await openDisclosure(machine, "Quote e potenze");
  await machine.locator('input[name="connectionWidth"]').fill("800");
  await machine.locator('input[name="connectionHeight"]').fill("178");
  await machine
    .getByRole("button", { name: "Inserisci macchina manuale", exact: true })
    .click();
  await viewer.getByRole("button", { name: "Bocchette", exact: true }).click();
  let palette = page.getByRole("dialog", { name: "Catalogo bocchette" });
  await palette
    .getByRole("button", { name: "Scegli EDLS", exact: true })
    .click();
  await expect(
    palette.getByRole("region", {
      name: "Distribuzione consigliata nelle stanze",
    }),
  ).toContainText("900");
  await palette
    .getByRole("button", { name: "Inserisci bocchette", exact: true })
    .click();
  await viewer.getByRole("button", { name: "Bocchette", exact: true }).click();
  palette = page.getByRole("dialog", { name: "Catalogo bocchette" });
  await palette.getByRole("button", { name: "Ripresa", exact: true }).click();
  await palette
    .getByRole("button", { name: "Scegli EGQ", exact: true })
    .click();
  await palette
    .getByRole("button", { name: "Inserisci bocchette", exact: true })
    .click();
  const p = await snapshot(page),
    system = p.hvacSystems[0];
  expect(system.genericMachine).toMatchObject({
    manufacturer: "Marca dichiarata",
    model: "UNITA-900",
    maxAirflowM3h: 900,
  });
  expect(system.capacityW).toBeNull();
  expect(system.airflowM3h).toBe(900);
  for (const use of ["supply", "return"])
    expect(
      p.airTerminals
        .filter((t) => t.use === use)
        .reduce((sum, t) => sum + t.requiredAirflowM3h, 0),
    ).toBeCloseTo(900, 10);
  await viewer.getByRole("button", { name: "Plenum", exact: true }).click();
  const plenum = page.getByRole("dialog", {
    name: "Plenum degli impianti autonomi",
  });
  await plenum
    .getByRole("button", { name: "Vista 3D plenum", exact: true })
    .click();
  await expect(
    plenum.getByTestId("plenum-preview-3d").locator("canvas"),
  ).toHaveAttribute("data-rendered", "true");
  await expect(plenum).toContainText("UNITA-900");
  await expect(plenum).toContainText(
    /Plenum per UNITA-900: 800 × 250 mm, profondità totale 640 mm/,
  );
  await plenum.screenshot({
    path: testInfo.outputPath("manual-machine-quoted-plenum.png"),
  });
  await plenum
    .getByRole("button", { name: "Chiudi plenum", exact: true })
    .click();
  await page.reload();
  expect((await snapshot(page)).hvacSystems).toEqual(p.hvacSystems);
});

test("official radiator photos and four independent finish choices persist without changing output", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await start(page);
  await page
    .getByTestId("viewer-3d")
    .getByRole("button", { name: "Radiatori", exact: true })
    .click();
  const palette = page.getByRole("dialog", { name: "Catalogo radiatori" });
  const model = palette
    .getByRole("button", { name: /Scegli Cordivari Ardesia 3 colonne/ })
    .first();
  await expect(model.locator("img")).toBeVisible();
  await model.click();
  await openDisclosure(palette, "Quantità e misure");
  await palette.getByLabel("Numero radiatori").fill("2");
  await expect(
    palette.getByRole("button", { name: "Inserisci radiatori", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  await palette
    .getByRole("button", { name: "Inserisci radiatori", exact: true })
    .click();
  const before = await snapshot(page);
  await openDisclosure(page.locator(".proprieta"), "Colori e finiture");
  const selectedRadiatorId = await page
    .getByTestId("viewer-3d")
    .locator("canvas")
    .getAttribute("data-selection");
  expect(before.radiators.some((r) => r.id === selectedRadiatorId)).toBe(true);
  for (const label of [
    "Colore radiatore",
    "Colore valvola",
    "Colore detentore",
    "Colore copritubo",
  ]) {
    const select = page.getByLabel(label, { exact: true });
    const options = await select
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLOptionElement).value).filter(Boolean),
      );
    if (options.length)
      await select.selectOption(options[Math.min(1, options.length - 1)]);
    else expect(await select.isDisabled()).toBe(true);
  }
  const after = await snapshot(page);
  const afterSelected = after.radiators.find(
    (r) => r.id === selectedRadiatorId,
  )!;
  const beforeSelected = before.radiators.find(
    (r) => r.id === selectedRadiatorId,
  )!;
  expect(afterSelected.outputW).toBe(beforeSelected.outputW);
  expect(Object.keys(afterSelected.finishes ?? {})).toEqual(
    expect.arrayContaining([
      "bodyColorId",
      "valveColorId",
      "lockshieldColorId",
      ...((await page.getByLabel("Colore copritubo").isDisabled())
        ? []
        : ["pipeCoverColorId"]),
    ]),
  );
  await page.screenshot({
    path: testInfo.outputPath("four-official-finish-choices.png"),
    fullPage: true,
  });
  await page.reload();
  expect(
    (await snapshot(page)).radiators.find((r) => r.id === selectedRadiatorId)
      ?.finishes,
  ).toEqual(afterSelected.finishes);
});
