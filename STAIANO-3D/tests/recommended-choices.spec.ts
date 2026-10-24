import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import {
  pickPlanPoint,
  openDisclosure,
  chooseTerminalModel,
  chooseFanCoilModel,
} from "./ui-helpers";

async function load(page: Page) {
  const fixture = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
    import { guidedProjectFixture } from './tests/guided-fixture.ts';
    import { addRectangle } from './src/domain/project.ts';
    import { ensureInstallations } from './src/domain/installations.ts';
    import { applyManualDuctedSystem } from './src/domain/ducted/apply.ts';
    import { placeDuctedDraft, placeMachineOnPlan } from './src/domain/ducted/graphic-installation.ts';
    import { connectDraftOnPlan } from './src/domain/ducted/plan-connections.ts';
    let p = ensureInstallations(guidedProjectFixture());
    p = addRectangle(p, p.floors[0].id, { width: 4, length: 4, height: 2.7, name: 'Studio piccolo', origin: { x: 10, y: 0 } });
    const s = p.hvacSystems[0];
    p = applyManualDuctedSystem(p, p.rooms.map(r => r.id), { ...s.genericMachine, maxAirflowM3h: 1200 }, s.id, s.installationId);
    p = placeMachineOnPlan(p, s.id, p.rooms[0].id, {x:3,y:3});
    for (const room of p.rooms) {
      p = placeDuctedDraft(p, s.installationId, room.id, room.centroid, 'terminal');
      p = connectDraftOnPlan(p, p.ductedDrafts.at(-1).id, s.id);
    }
    console.log(JSON.stringify(p));
  `,
      ],
      { encoding: "utf8" },
    ),
  );
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "recommendations.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  return fixture;
}

for (const width of [1920, 1024]) {
  test(`terminal recommendations use the room share and show size buttons and rectangular grids at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const fixture = await load(page);
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    const popup = page.getByRole("dialog", {
      name: "Scegli bocchetta sul punto",
    });
    const areas: number[] = [];
    for (const room of [fixture.rooms[1], fixture.rooms[0]]) {
      await plan
        .getByRole("button", { name: "Bocchetta", exact: true })
        .click();
      const draft = fixture.ductedDrafts.find(
        (item: { roomId: string }) => item.roomId === room.id,
      );
      await plan.locator(`[data-point-id="${draft.id}"]`).click();
      await expect(plan.getByTestId("draft-terminal")).toHaveCount(2);
      const manual = popup
        .locator("summary")
        .filter({ hasText: "Configurazione da modulo e dettagli tecnici" });
      if (await manual.isVisible())
        await openDisclosure(
          popup,
          "Configurazione da modulo e dettagli tecnici",
        );
      const primary = popup.getByRole("group", {
        name: "Bocchette principali",
      });
      await expect(
        primary.getByRole("button", { name: "Scegli EBL", exact: true }),
      ).toContainText("Consigliata");
      await expect(
        popup.getByRole("button", { name: "Scegli EGA6", exact: true }),
      ).toHaveCount(0);
      await primary
        .getByRole("button", { name: "Scegli EBL", exact: true })
        .click();
      await expect(popup.getByRole("table")).toBeVisible();
      const sizes = popup.getByRole("group", {
        name: "Soluzione terminale",
        exact: true,
      });
      const recommended = sizes.locator('button[data-recommended="true"]');
      await expect(recommended).toHaveCount(1);
      const numbers = (await recommended.getAttribute("aria-label"))!
        .match(/\d+/g)!
        .map(Number);
      areas.push(numbers[0] * numbers[1]);
      await expect(
        popup.locator('[aria-label="Misura consigliata"]'),
      ).toContainText(room.name);
      await popup.screenshot({
        path: info.outputPath(`ebl-${room.name}-${width}.png`),
      });
      await popup
        .getByLabel("Larghezza faccia dichiarata", { exact: true })
        .fill(String(numbers[0]));
      await popup
        .getByLabel("Altezza faccia dichiarata", { exact: true })
        .fill(String(numbers[1]));
      const alternative = sizes
        .locator('table button:not([data-recommended="true"])')
        .first();
      await alternative.click();
      await expect(alternative).toHaveAttribute("aria-pressed", "true");
      await expect(
        popup.getByLabel("Larghezza faccia dichiarata", { exact: true }),
      ).toHaveValue("");
      await expect(
        popup.getByLabel("Altezza faccia dichiarata", { exact: true }),
      ).toHaveValue("");
      await expect(recommended).toHaveCount(1);
      await popup.getByRole("button", { name: "Ripresa", exact: true }).click();
      await expect(
        popup.getByRole("button", { name: "Scegli EDLS", exact: true }),
      ).toHaveCount(0);
      await expect(
        popup.getByRole("button", { name: "Scegli EDFL-20", exact: true }),
      ).toHaveCount(0);
      await popup.getByRole("button", { name: "Mandata", exact: true }).click();
      await chooseTerminalModel(popup, "EDLS");
      const length = popup.getByRole("group", {
        name: /^Lunghezza (singola bocchetta|modulo 1)$/,
      });
      await expect(
        length.locator('button[data-recommended="true"]'),
      ).toHaveCount(1);
      await expect(length.locator('button[aria-pressed="true"]')).toHaveCount(
        1,
      );
      if (room.id === fixture.rooms[1].id) {
        await popup
          .getByRole("group", { name: "Numero di feritoie", exact: true })
          .getByRole("button", { name: "1 feritoia", exact: true })
          .click();
        await expect(
          length.getByRole("button", { name: "1200 mm", exact: true }),
        ).toHaveAttribute("data-recommended", "true");
        await popup
          .locator("summary")
          .filter({ hasText: "Prestazioni e misura feritoie" })
          .click();
        await popup
          .getByRole("group", { name: "Soluzione terminale", exact: true })
          .getByRole("button", {
            name: /1 feritoia · 30 mm · 210 m³\/h per metro · 32 dB/,
          })
          .click();
        await expect(
          length.getByRole("button", { name: "1500 mm", exact: true }),
        ).toHaveAttribute("data-recommended", "true");
        await expect(
          length.getByRole("button", { name: "1200 mm", exact: true }),
        ).not.toHaveAttribute("data-recommended", "true");
        await expect(
          popup.locator('[aria-label="Portata della lunghezza consigliata"]'),
        ).toContainText("Fabbisogno per punto: 300");
        await expect(
          popup.locator('[aria-label="Portata della lunghezza consigliata"]'),
        ).toContainText("Capacità: 315");
        await popup
          .getByRole("button", { name: "Usa taglia consigliata · 1 modulo" })
          .click();
        await expect(
          length.getByRole("button", { name: "1500 mm", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      }
      await popup.screenshot({
        path: info.outputPath(`linear-${room.name}-${width}.png`),
      });
      await popup
        .locator("footer")
        .getByRole("button", { name: "Annulla", exact: true })
        .click();
    }
    expect(areas[1]).toBeGreaterThanOrEqual(areas[0]);
  });

  test(`recommended models stay highlighted independently from manual choices at ${width}`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    const fixture = await load(page);
    const plan = page.getByRole("region", {
      name: "Configurazione grafica canalizzato",
    });
    await plan
      .getByRole("button", { name: "Pompa di calore", exact: true })
      .click();
    await pickPlanPoint(plan, 4, -0.7);
    await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
    await plan.getByTestId("draft-heatPump").click();
    await plan.getByRole("button", { name: "Collega", exact: true }).click();
    await plan.getByTestId("draft-heatPump").click();
    await plan.getByRole("button", { name: /^Macchina UI/ }).click();
    await page.keyboard.press("Escape");
    await plan.getByTestId("draft-heatPump").click();
    await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
    const pump = page.getByRole("dialog", { name: "Scegli pompa di calore" });
    const recommended = pump.locator('button[data-recommended="true"]');
    await expect(recommended).toHaveCount(1);
    const name = await recommended.getAttribute("aria-label");
    await recommended.click();
    await expect(recommended).toHaveAttribute("aria-pressed", "true");
    await pump
      .locator('button[aria-label^="Scegli "]:not([data-recommended="true"])')
      .last()
      .click();
    await expect(recommended).toHaveAttribute("aria-label", name!);
    await expect(recommended).toHaveAttribute("aria-pressed", "false");
    await pump.locator(":scope > div").evaluate((node) => {
      node.scrollTop = 0;
    });
    await pump.screenshot({ path: info.outputPath(`pump-${width}.png`) });
    await pump
      .locator("footer")
      .getByRole("button", { name: "Annulla", exact: true })
      .click();
    for (const [label, type, recommendation] of [
      ["Split", "split", "Split consigliato"],
      ["Ventilconvettore", "fanCoil", "Ventilconvettore consigliato"],
    ]) {
      await plan.getByRole("button", { name: label, exact: true }).click();
      await pickPlanPoint(
        plan,
        type === "fanCoil" ? fixture.rooms[1].centroid.x : 4,
        0.4,
      );
      await plan.getByTestId(`draft-${type}`).click();
      const popup = page.getByRole("dialog", { name: "Configura apparecchio" });
      if (type === "fanCoil")
        await chooseFanCoilModel(popup, {
          manufacturer: "Aermec",
          model: "FCZ",
        });
      await expect(
        popup.locator(`[aria-label="${recommendation}"]`),
      ).toBeVisible();
      await expect(
        popup.locator(`[aria-label="${recommendation}"]`),
      ).toBeInViewport();
      await popup.screenshot({ path: info.outputPath(`${type}-${width}.png`) });
      await popup
        .locator("footer")
        .getByRole("button", { name: "Annulla", exact: true })
        .click();
    }
  });
}
