import {
  addPlanTerminal,
  pickPlanPoint,
  configurePlanTerminal,
} from "./ui-helpers";
import { readFileSync } from "node:fs";
import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "./browser-test";
import { projectSchema, type Project } from "../src/schemas/project";
import { splitCatalogSchema } from "../src/domain/catalogs/split-schema";
import { openDisclosure } from "./ui-helpers";

async function exportProject(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<Project> {
  const waiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  const download = await waiting;
  const path = testInfo.outputPath(`${name}.hvacproj`);
  await download.saveAs(path);
  return projectSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

async function createManualRoom(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /^Disegna manualmente/ }).click();
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

test("novice places a verified tubular radiator on the plan and saves a GPU JPG", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  let meaningfulClicks = 0;
  await page.getByRole("button", { name: "Nuovo", exact: true }).click();
  meaningfulClicks++;
  await page
    .getByRole("dialog", { name: "Nuovo progetto" })
    .getByRole("button", { name: "Disegna manualmente", exact: true })
    .click();
  meaningfulClicks++;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  meaningfulClicks++;
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Radiatore", exact: true }).click();
  meaningfulClicks++;
  await pickPlanPoint(plan, 2, 0.4);
  meaningfulClicks++;
  await plan.getByTestId("draft-radiator").click();
  meaningfulClicks++;
  const palette = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await palette.getByRole("button", { name: "Cordivari", exact: true }).click();
  meaningfulClicks++;
  await palette.getByRole("button", { name: "Ardesia", exact: true }).click();
  meaningfulClicks++;
  await palette.getByRole("button", { name: "3 colonne", exact: true }).click();
  meaningfulClicks++;
  await palette.getByRole("button", { name: /^ALTEZZA 500\b/ }).click();
  meaningfulClicks++;
  await expect(
    palette.getByRole("button", { name: "Selezionata", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("novice-real-radiator-catalog.png"),
    fullPage: true,
  });
  await palette
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  meaningfulClicks++;
  // La prima posa comprende posizione, marca, famiglia, colonne e altezza esplicite.
  expect(meaningfulClicks).toBeLessThanOrEqual(11);
  await expect(palette).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const project = await exportProject(page, testInfo, "novice-radiator");
  expect(project.rooms).toHaveLength(1);
  expect(project.rooms[0].netAreaM2).toBeCloseTo(15.96, 8);
  expect(project.radiators).toHaveLength(1);
  const radiator = project.radiators[0];
  expect(radiator.manufacturer).toBe("Cordivari");
  expect(radiator.family).toBe("Ardesia 3 colonne");
  expect(radiator.outputW).toBeGreaterThanOrEqual(project.rooms[0].designLoadW);
  expect(radiator.widthMm).toBeGreaterThan(100);
  expect(radiator.heightMm).toBeGreaterThan(100);
  expect(radiator.depthMm).toBeGreaterThan(50);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(viewer.locator("canvas")).toHaveAttribute(
    "data-selection",
    radiator.id,
  );
  const imageWaiting = page.waitForEvent("download");
  await openDisclosure(page.getByTestId("viewer-3d"), "Vista 3D");
  await viewer
    .getByRole("button", { name: "Salva render", exact: true })
    .click();
  const imageDownload = await imageWaiting;
  expect(imageDownload.suggestedFilename()).toMatch(/-render\.jpg$/);
  const imagePath = testInfo.outputPath("novice-radiator-render.jpg");
  await imageDownload.saveAs(imagePath);
  const bytes = readFileSync(imagePath);
  expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
  expect(bytes.length).toBeGreaterThan(30000);
  const dimensions = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${base64}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, bytes.toString("base64"));
  expect(dimensions).toEqual({ width: 1600, height: 900 });
  await page.reload();
  await expect(page.getByTestId("radiator-2d")).toHaveCount(1);
  const restored = await exportProject(
    page,
    testInfo,
    "novice-radiator-restored",
  );
  expect(restored.radiators).toEqual(project.radiators);
});

test("3D climatizzatori placement preserves the explicitly chosen real brand and indoor model", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1680, height: 1050 });
  await createManualRoom(page);
  await openDisclosure(page.getByTestId("viewer-3d"), "Aggiungi apparecchio");
  await page
    .getByTestId("viewer-3d")
    .getByRole("button", { name: "Climatizzatori", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Inserisci apparecchio" })
    .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await pickPlanPoint(plan, 2, 0.4);
  await plan.getByTestId("draft-split").click();
  const palette = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await palette
    .getByRole("group", { name: "Marca split", exact: true })
    .getByRole("button", { name: "Mitsubishi Electric", exact: true })
    .click();
  const choices = palette
    .getByRole("group", { name: "Taglia split", exact: true })
    .getByRole("button")
    .filter({ hasText: /MSZ/ });
  expect(await choices.count()).toBeGreaterThan(0);
  const chosen = choices.nth(Math.min(1, (await choices.count()) - 1));
  const chosenId = (await chosen.getAttribute("data-id"))!;
  const chosenModel = (await chosen.locator("strong").textContent())!.match(
    /\bMSZ\S*\d\S*/,
  )![0];
  await chosen.click();
  await expect(chosen).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: testInfo.outputPath("novice-split-model-catalog.png"),
    fullPage: true,
  });
  await palette
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  await expect(palette).toHaveCount(0);
  const project = await exportProject(page, testInfo, "chosen-split");
  expect(project.hvacSystems).toHaveLength(1);
  const system = project.hvacSystems[0];
  expect(system.manufacturer).toBe("Mitsubishi Electric");
  expect(system.productId).toBe(chosenId);
  expect(system.compatibilityStatus).toBe("verified");
  const original = splitCatalogSchema.parse(
    JSON.parse(readFileSync("catalog-data/generated/splits.json", "utf8")),
  );
  expect(system.catalogVersion).toBe(original.version);
  const indoor = original.indoorUnits.find(
    (unit) => unit.id === system.indoorUnits[0].productId,
  )!;
  expect(indoor.model).toBe(chosenModel);
  expect(system.indoorUnits[0]).toMatchObject({
    widthMm: indoor.widthMm,
    heightMm: indoor.heightMm,
    depthMm: indoor.depthMm,
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-selection",
    system.indoorUnits[0].id,
  );
  await page.reload();
  await expect(page.getByTestId("split-2d")).toHaveCount(1);
  expect(
    (await exportProject(page, testInfo, "chosen-split-restored")).hvacSystems,
  ).toEqual(project.hvacSystems);
});

test("two independently configured ducted zones keep each terminal assigned after editing the second zone", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1680, height: 1050 });
  const blank = JSON.parse(
    readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8"),
  ) as import("../src/schemas/project").Project;
  blank.hvacSystems = [];
  blank.radiators = [];
  blank.airTerminals = [];
  blank.rooms = blank.rooms.map((room) => ({ ...room, systemType: "none" }));
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "independent-zones.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(blank)),
  });
  await expect(page.locator(".nome-stanza")).toHaveCount(4);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const viewer = page.getByTestId("viewer-3d");
  for (const [index, [roomName, brand]] of [
    ["Soggiorno", "Daikin"],
    ["Studio", "Gree"],
  ].entries()) {
    await openDisclosure(viewer, "Aggiungi apparecchio");
    await viewer
      .getByRole("button", { name: "Bocchette", exact: true })
      .click();
    await page
      .getByRole("complementary", { name: "Inserisci apparecchio" })
      .getByRole("button", { name: "Inserisci sulla pianta", exact: true })
      .click();
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    const room = blank.rooms.find((item) => item.name === roomName)!;
    await plan.getByRole("button", { name: "Macchina", exact: true }).click();
    await pickPlanPoint(plan, room.centroid.x, room.centroid.y);
    await plan
      .getByRole("group", { name: "Funzione bocchetta", exact: true })
      .getByRole("button", { name: "Mandata", exact: true })
      .click();
    await plan.getByRole("button", { name: "Bocchetta", exact: true }).click();
    await pickPlanPoint(plan, room.centroid.x - 1, room.centroid.y - 1);
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-machine").click();
    await plan.getByTestId("draft-terminal").click();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-machine").click();
    const picker = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await picker
      .getByRole("group", { name: "Marca canalizzato" })
      .getByRole("button", { name: brand, exact: true })
      .click();
    await picker
      .locator("footer")
      .getByRole("button", { name: "Salva", exact: true })
      .click();
    await plan.getByTestId("draft-terminal").click();
    await configurePlanTerminal(page, "EDLS", [1000]);
    await addPlanTerminal(
      page,
      room.centroid.x + 1,
      room.centroid.y - 1,
      "EDLS",
      [1000],
      "supply",
      index,
    );
    await addPlanTerminal(
      page,
      room.centroid.x,
      room.centroid.y + 1,
      "EGQ",
      [],
      "return",
      index,
    );
    await page.getByRole("button", { name: "3D", exact: true }).click();
  }
  const before = await exportProject(page, testInfo, "two-independent-zones");
  expect(before.hvacSystems).toHaveLength(2);
  const living = before.rooms.find((room) => room.name === "Soggiorno")!,
    study = before.rooms.find((room) => room.name === "Studio")!;
  const zoneA = before.hvacSystems.find((system) =>
      system.roomIds.includes(living.id),
    )!,
    zoneB = before.hvacSystems.find((system) =>
      system.roomIds.includes(study.id),
    )!;
  expect(zoneA.id).not.toBe(zoneB.id);
  expect(zoneA.roomIds).toEqual([living.id]);
  expect(zoneB.roomIds).toEqual([study.id]);
  expect(zoneA.manufacturer).toBe("Daikin");
  expect(zoneB.manufacturer).toBe("Gree");
  for (const room of [living, study]) {
    const system = before.hvacSystems.find((item) =>
      item.roomIds.includes(room.id),
    )!;
    const terminals = before.airTerminals.filter(
      (item) => item.roomId === room.id,
    );
    expect(terminals.filter((item) => item.use === "supply")).toHaveLength(2);
    expect(terminals.filter((item) => item.use === "return")).toHaveLength(1);
    expect(terminals.every((item) => item.systemId === system.id)).toBe(true);
  }
  await page.getByRole("button", { name: "2D", exact: true }).click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "Seleziona", exact: true }).click();
  await plan
    .getByRole("button", { name: /^Macchina UI/ })
    .nth(1)
    .locator("rect")
    .first()
    .click();
  const picker = page.getByRole("dialog", {
    name: "Scegli macchina canalizzata",
  });
  await picker
    .getByLabel("Nome macchina canalizzata", { exact: true })
    .fill("Zona studio indipendente");
  await picker
    .locator("footer")
    .getByRole("button", { name: "Salva", exact: true })
    .click();
  const after = await exportProject(page, testInfo, "two-zones-edited");
  expect(after.hvacSystems.find((system) => system.id === zoneA.id)).toEqual(
    zoneA,
  );
  expect(
    after.airTerminals.filter((item) => item.systemId === zoneA.id),
  ).toEqual(before.airTerminals.filter((item) => item.systemId === zoneA.id));
  expect(after.hvacSystems.find((system) => system.id === zoneB.id)?.name).toBe(
    "Zona studio indipendente",
  );
  await page.screenshot({
    path: testInfo.outputPath("two-independent-ducted-zones.png"),
    fullPage: true,
  });
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  const restored = await exportProject(page, testInfo, "two-zones-restored");
  expect(restored.hvacSystems).toEqual(after.hvacSystems);
  expect(restored.airTerminals).toEqual(after.airTerminals);
  for (const [index, system] of restored.hvacSystems.entries()) {
    await plan
      .getByRole("button", { name: /^Macchina UI/ })
      .nth(index)
      .locator("rect")
      .first()
      .click();
    const details = page.getByRole("dialog", {
      name: "Scegli macchina canalizzata",
      exact: true,
    });
    await openDisclosure(details, "Schema e dimensionamento plenum");
    const plenum = details.getByRole("region", {
      name: "Plenum di mandata",
      exact: true,
    });
    const hide = plenum.getByRole("button", {
      name: "Chiudi vista 3D plenum",
      exact: true,
    });
    if (await hide.count()) await hide.click();
    const diagram = plenum.locator('img[alt^="Schema plenum di mandata:"]');
    await expect(diagram).toBeVisible();
    if (system.manufacturer === "Daikin")
      await expect(plenum).toContainText(
        /Plenum su misura \d+ × \d+ × \d+ mm, collegato all’uscita macchina documentata/,
      );
    const alt = await diagram.getAttribute("alt");
    const branchCount = Number(alt?.match(/: (\d+) stacchi/)?.[1]);
    expect(branchCount).toBeGreaterThan(0);
    await expect(
      plenum.locator("dd").filter({ hasText: `${branchCount} stacchi` }),
    ).toBeVisible();
    const show = plenum.getByRole("button", {
      name: "Vista 3D plenum",
      exact: true,
    });
    if (await show.count()) await show.click();
    await expect(
      plenum.getByTestId("plenum-preview-3d").locator("canvas"),
    ).toHaveAttribute("data-plenum-ports", String(branchCount));
    await page.screenshot({
      path: testInfo.outputPath(`plenum-${system.manufacturer}.png`),
      fullPage: true,
    });
    await details
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
  }
  const dossierWaiting = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Dossier PDF", exact: true }).click();
  await (
    await dossierWaiting
  ).saveAs(testInfo.outputPath("autonomous-plenum-render.pdf"));
  await expect(page.locator('[data-staiano-render-export="true"]')).toHaveCount(
    0,
  );
});
