import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./browser-test";
import { dragPlanDevice, openDisclosure, pickPlanPoint, chooseFanCoilModel } from "./ui-helpers";
import { projectSchema } from "../src/schemas/project";

async function saved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const download = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(readFileSync((await (await download).path())!, "utf8")),
  );
}

for (const width of [1920, 1024]) {
  for (const [type, label, testId] of [
    ["radiator", "Radiatore", "radiator-2d"],
    ["fanCoil", "Ventilconvettore", "fan-coil-2d"],
    ["split", "Split", "split-2d"],
  ] as const) {
    test(`${type} uses pending placement, popup, save, edit, move and undo at ${width}`, async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize({
        width,
        height: width === 1920 ? 1080 : 768,
      });
      const fixture = JSON.parse(
        readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
      ).empty;
      for (const key of [
        "hvacSystems",
        "installations",
        "airTerminals",
        "plenums",
        "ducts",
        "fanCoils",
        "radiators",
        "hydronicSystems",
        "ductedDrafts",
        "heatPumpDrafts",
        "equipmentDrafts",
      ])
        fixture[key] = [];
      fixture.rooms.forEach((room: { systemType: string }) => {
        room.systemType = "none";
      });
      await page.goto("/");
      await page.getByTestId("project-file").setInputFiles({
        name: "equipment.hvacproj",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(fixture)),
      });
      await page
        .getByRole("button", { name: "Continua liberamente nell’editor" })
        .click();
      const plan = page.getByRole("region", {
        name: "Configurazione grafica canalizzato",
      });
      const popup = page.getByRole("dialog", {
        name: "Configura apparecchio",
        exact: true,
      });
      const draft = plan.getByTestId(`draft-${type}`);
      const device = plan.getByTestId(testId);
      await plan.getByRole("button", { name: label, exact: true }).click();
      await pickPlanPoint(plan, 3, 0.4);
      await expect(popup).toHaveCount(0);
      await expect(draft).toHaveCount(1);
      await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
      await page.getByRole("button", { name: "3D", exact: true }).click();
      await expect(
        page.getByTestId("viewer-3d").locator("canvas"),
      ).toHaveAttribute("data-rendered", "true");
      await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
      await page.getByRole("button", { name: "2D", exact: true }).click();
      const pending = await saved(page);
      expect(pending.equipmentDrafts).toHaveLength(1);
      expect(pending.installations).toEqual([]);
      await page.reload();
      await expect(draft).toHaveCount(1);
      await page.keyboard.press("m");
      await dragPlanDevice(page, plan, draft, 4, 0.4);
      await plan
        .getByRole("button", { name: "Seleziona", exact: true })
        .click();
      await draft.click();
      await expect(popup).toBeVisible();
      await expect(page.locator("#proprieta-progetto")).not.toBeVisible();
      await popup
        .locator("footer")
        .getByRole("button", { name: "Annulla", exact: true })
        .click();
      await expect(draft).toHaveCount(1);
      await draft.click();
      async function chooseRadiator() {
        if (type !== "radiator") return;
        await popup
          .getByRole("group", { name: "Marca radiatori", exact: true })
          .getByRole("button", { name: "Global", exact: true })
          .click();
        await popup
          .getByRole("group", { name: "Famiglia radiatori", exact: true })
          .getByText("VIP", { exact: true })
          .click();
        await popup
          .getByLabel("Potenza da coprire con questo punto (W)")
          .fill("1800");
        await popup
          .getByRole("button", { name: "Trova radiatori compatibili" })
          .click();
        await expect(
          popup.getByRole("button", { name: "Selezionata", exact: true }),
        ).toBeEnabled();
      }
      await chooseRadiator();
      if (type === "fanCoil")
        await chooseFanCoilModel(popup, {
          manufacturer: "Aermec",
          model: "FCZ",
        });
      await popup.screenshot({ path: info.outputPath(`${type}-popup.png`) });
      await popup
        .locator("footer")
        .getByRole("button", { name: "Salva", exact: true })
        .click();
      await expect(popup).toHaveCount(0);
      await expect(draft).toHaveCount(0);
      await expect(device).toHaveCount(1);
      const id = await device.getAttribute("data-device-id");
      await device.locator("rect").first().click();
      await expect(popup).toBeVisible();
      await chooseRadiator();
      if (type === "fanCoil")
        await chooseFanCoilModel(popup, {
          manufacturer: "Aermec",
          model: "FCZ",
        });
      await popup
        .locator("footer")
        .getByRole("button", { name: "Salva", exact: true })
        .click();
      await expect(popup).toHaveCount(0);
      await expect(device).toHaveAttribute("data-device-id", id!);
      await expect(device).toHaveCount(1);
      await page.keyboard.press("Escape");
      await page.keyboard.press("m");
      await dragPlanDevice(page, plan, device, 5, 0.4);
      await plan.locator('summary[aria-label="Azioni apparecchio"]').click();
      page.once("dialog", (dialog) => dialog.accept());
      await plan.getByRole("button", { name: "Elimina", exact: true }).click();
      await expect(device).toHaveCount(0);
      await plan.locator('summary[aria-label="Altre azioni"]').click();
      await plan
        .getByRole("button", { name: "Annulla ultima modifica", exact: true })
        .click();
      await expect(device).toHaveCount(1);
      const result = await saved(page);
      expect(result.equipmentDrafts).toEqual([]);
      expect(result.installations).toHaveLength(1);
      const placed =
        type === "radiator"
          ? result.radiators[0]
          : type === "fanCoil"
            ? result.fanCoils![0]
            : result.hvacSystems[0].indoorUnits[0];
      expect(placed.id).toBe(id);
      expect(placed.position.x).toBeCloseTo(5, 1);
      await page.reload();
      await expect(device).toHaveCount(1);
      await plan.screenshot({ path: info.outputPath(`${type}-plan.png`) });
    });
  }
}
