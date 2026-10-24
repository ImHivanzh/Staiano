import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import {
  openDisclosure,
  addPlanTerminal,
  pickPlanPoint,
  configurePlanTerminal,
} from "./ui-helpers";

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
  await openDisclosure(page, "File");
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
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await viewer
    .getByRole("button", { name: "Macchina manuale", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Inserisci apparecchio" })
    .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Macchina", exact: true }).click();
  await pickPlanPoint(plan, 2, 2);
  await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
  await pickPlanPoint(plan, 1, 1);
  await plan.getByRole("button", { name: "Collega", exact: true }).click();
  await plan.getByTestId("draft-machine").click();
  await plan.getByTestId("draft-terminal").click();
  await page.keyboard.press("Escape");
  await plan.getByTestId("draft-machine").click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker.getByRole("button", { name: "Dati manuali" }).click();
  await picker.getByLabel("Marca macchina manuale").fill("Marca dichiarata");
  await picker.getByLabel("Modello macchina manuale").fill("UNITA-900");
  await picker.getByLabel("Portata massima macchina manuale").fill("900");
  for (const [name, value] of [
    ["width", "900"],
    ["height", "250"],
    ["depth", "700"],
    ["connectionWidth", "800"],
    ["connectionHeight", "178"],
    ["cooling", "5.2"],
    ["heating", "6.4"],
  ])
    await picker.locator(`input[name="${name}"]`).fill(value);
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await plan.getByTestId("draft-terminal").click();
  await configurePlanTerminal(page, "EDLS", [1000]);
  await addPlanTerminal(page, 3, 1, "EGQ", [], "return");

  const p = await snapshot(page),
    system = p.hvacSystems[0];
  expect(system.genericMachine).toMatchObject({
    manufacturer: "Marca dichiarata",
    model: "UNITA-900",
    maxAirflowM3h: 900,
    coolingCapacityW: 5200,
    heatingCapacityW: 6400,
    dischargeConnection: { connectionWidthMm: 800, connectionHeightMm: 178 },
  });
  expect(system.capacityW).toBe(5200);
  expect(system.airflowM3h).toBe(900);
  for (const use of ["supply", "return"])
    expect(
      p.airTerminals
        .filter((t) => t.use === use)
        .reduce((sum, t) => sum + t.requiredAirflowM3h, 0),
    ).toBeCloseTo(900, 10);
  await plan.getByRole("button", { name: "Plenum", exact: true }).click();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  await expect(plan.getByTestId("plenum-2d")).toHaveCount(1);
  expect((await snapshot(page)).plenums[0].widthMm).toBe(800);
  await plan.getByRole("button", { name: "Seleziona", exact: true }).click();
  await plan.getByRole("button", { name: /^Macchina UI/ }).click();
  const details = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
    exact: true,
  });
  await openDisclosure(details, "Schema e dimensionamento plenum");
  const plenum = details.getByRole("region", {
    name: "Plenum di mandata",
    exact: true,
  });
  await plenum
    .getByRole("button", { name: "Vista 3D plenum", exact: true })
    .click();
  await expect(
    plenum.getByTestId("plenum-preview-3d").locator("canvas"),
  ).toHaveAttribute("data-rendered", "true");
  await expect(plenum).toContainText("UNITA-900");
  await expect(plenum).toContainText(
    /Plenum su misura 800 × \d+ × \d+ mm, collegato all’uscita macchina documentata/,
  );
  for (const width of [1680, 1024]) {
    await page.setViewportSize({ width, height: 1050 });
    await expect
      .poll(() =>
        plenum.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        details.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      )
      .toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("manual-machine-quoted-plenum.png"),
    fullPage: true,
  });

  await plenum
    .getByRole("button", { name: "Chiudi vista 3D plenum", exact: true })
    .click();
  await details
    .getByRole("button", { name: "Plenum di ripresa", exact: true })
    .click();
  const returnPanel = details.getByRole("region", {
    name: "Plenum di ripresa",
    exact: true,
  });
  await returnPanel
    .getByLabel("Larghezza attacco ripresa (mm)", { exact: true })
    .fill("700");
  await returnPanel
    .getByLabel("Altezza attacco ripresa (mm)", { exact: true })
    .fill("180");
  await returnPanel
    .getByRole("button", { name: "Salva attacco di ripresa", exact: true })
    .click();
  await returnPanel
    .getByRole("button", {
      name: "Crea plenum di ripresa nel progetto",
      exact: true,
    })
    .click();
  await details
    .locator("footer")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  const completed = await snapshot(page);
  expect(completed.plenums).toHaveLength(2);
  expect(completed.plenums.map((item) => item.use).sort()).toEqual([
    "return",
    "supply",
  ]);
  expect(completed.hvacSystems).toEqual([
    {
      ...system,
      returnConnection: {
        connectionWidthMm: 700,
        connectionHeightMm: 180,
        dimensionBasis: "ductOpening",
      },
    },
  ]);
  await page.reload();
  const restored = await snapshot(page);
  expect(restored.hvacSystems).toEqual(completed.hvacSystems);
  expect(restored.plenums).toEqual(completed.plenums);
});

test("official radiator photos and four independent finish choices persist without changing output", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await start(page);
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await page
    .getByTestId("viewer-3d")
    .getByRole("button", { name: "Radiatori", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Inserisci apparecchio" })
    .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  for (const x of [1.2, 3]) {
    await plan.getByRole("button", { name: "Radiatore", exact: true }).click();
    await pickPlanPoint(plan, x, 0.4);
    await plan.getByTestId("draft-radiator").click();
    const palette = page.getByRole("dialog", {
      name: "Configura apparecchio",
      exact: true,
    });
    await palette
      .getByRole("button", { name: "Cordivari", exact: true })
      .click();
    const family = palette.getByRole("button", {
      name: "Ardesia",
      exact: true,
    });
    await expect(family.locator("img")).toBeVisible();
    await family.click();
    await palette
      .getByRole("button", { name: "3 colonne", exact: true })
      .click();
    await palette
      .getByLabel("Potenza da coprire con questo punto (W)", { exact: true })
      .fill("600");
    await palette.getByRole("button", { name: /^ALTEZZA 500\b/ }).click();
    await expect(
      palette.getByRole("button", { name: "Selezionata", exact: true }),
    ).toBeEnabled();
    await palette
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await expect(palette).toHaveCount(0);
  }
  const before = await snapshot(page);
  expect(before.radiators).toHaveLength(2);
  const selectedRadiatorId = before.radiators[1].id;
  await openDisclosure(page, "Modifica");
  await page
    .getByLabel("Elemento nel progetto", { exact: true })
    .selectOption(selectedRadiatorId);
  const properties = page.getByRole("button", {
    name: "Mostra proprietà",
    exact: true,
  });
  if ((await properties.getAttribute("aria-expanded")) !== "true")
    await properties.click();
  await openDisclosure(page.locator(".proprieta"), "Colori e finiture");
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
  expect(after.radiators[0]).toEqual(before.radiators[0]);
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
