import { readFileSync } from "node:fs";
import { test, expect } from "./browser-test";
import { projectSchema } from "../src/schemas/project";
import { openDisclosure, pickPlanPoint } from "./ui-helpers";

async function saved(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  const downloaded = page.waitForEvent("download");
  await openDisclosure(page, "File");
  await page.getByRole("button", { name: "Esporta", exact: true }).click();
  return projectSchema.parse(
    JSON.parse(
      readFileSync((await (await downloaded).path())!.toString(), "utf8"),
    ),
  );
}

/** Canale disegnato in pianta con lo strumento Canale, come in officina. */
test("il canale si traccia in pianta e compare come doppia linea", async ({
  page,
}) => {
  test.setTimeout(120000);
  const project = JSON.parse(
    readFileSync(".cache/guided-ui-fixtures.json", "utf8"),
  ).network;
  const terminal = project.airTerminals.find(
    (item: { use: string; position: { x: number } }) =>
      item.use === "supply" && item.position.x < 3,
  );
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "canale-disegnato.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const free = page.getByRole("button", {
    name: "Continua liberamente nell’editor",
  });
  if (await free.count()) await free.click();
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan).toBeVisible();

  await plan.getByRole("button", { name: "Canale", exact: true }).click();
  // Prima la bocchetta da servire, poi i punti del percorso.
  await pickPlanPoint(plan, terminal.position.x, terminal.position.y);
  await pickPlanPoint(plan, terminal.position.x, terminal.position.y + 1);
  await pickPlanPoint(
    plan,
    terminal.position.x + 1.2,
    terminal.position.y + 1.6,
  );
  await expect(plan.getByTestId("duct-preview")).toBeVisible();
  await page.screenshot({ path: ".cache/canale-tracciato.png" });
  await page.keyboard.press("Enter");

  await expect(plan.getByTestId("duct-2d").first()).toBeVisible();
  await page.screenshot({ path: ".cache/canale-2d.png" });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.getByTestId("viewer-3d").locator("canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true", {
    timeout: 30000,
  });
  await expect(canvas).toHaveAttribute("data-duct-count", /^[1-9]/);
  await page.screenshot({ path: ".cache/canale-3d.png" });
  const result = await saved(page);
  const duct = result.ducts?.find((item) => item.terminalId === terminal.id);
  expect(duct, "il canale della bocchetta è salvato").toBeTruthy();
  expect(duct!.routing).toBe("manual");
  expect(duct!.waypoints).toHaveLength(2);
  expect(duct!.shape).toBe("rectangle");
  expect(duct!.widthMm).toBeGreaterThan(0);
});
