import { readFileSync } from "node:fs";
import { expect, test } from "./browser-test";
import { pickPlanPoint } from "./ui-helpers";

test("VRV/VRF Daikin: inserimento, configurazione, salvataggio e ricaricamento", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 1000 });
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
    name: "vrv.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Continua liberamente nell’editor" })
    .click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await plan.getByRole("button", { name: "VRV/VRF", exact: true }).click();
  await pickPlanPoint(plan, 3, 0.4);
  const draft = plan.getByTestId("draft-vrv");
  await expect(draft).toHaveCount(1);
  await draft.click();
  const popup = page.getByRole("dialog", {
    name: "Configura apparecchio",
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect(
    popup.getByRole("heading", { name: "VRV/VRF Daikin" }),
  ).toBeVisible();
  await expect(popup.getByLabel("Serie e modello VRV")).not.toHaveValue("");
  await popup.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByTestId("vrv-2d")).toHaveCount(1);
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("vrv-2d")).toHaveCount(1);
  await page.getByTestId("vrv-2d").click();
  await expect(page.locator(".corpo-proprieta")).toContainText("VRV/VRF");
});
