import { expect, test } from "./browser-test";
import { plenumFixture } from "./plenum-ui-fixture";
import { openDisclosure } from "./ui-helpers";

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`Vista canali: flessibili e due plenum visibili a ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const project = plenumFixture(true);
    // Existing projects with no separately inserted bodies still show their catalogue plenums.
    project.plenums = [];
    project.ducts = [];
    project.airTerminals.forEach((t) => {
      t.plenumId = null;
      t.position = { x: 6, y: 4 };
    });
    await page.goto("/");
    await page.getByTestId("project-file").setInputFiles({
      name: "canali.hvacproj",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
    const free = page.getByRole("button", {
      name: "Continua liberamente nell’editor",
    });
    if (await free.count()) await free.click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const canvas = page.getByTestId("viewer-3d").locator("canvas");
    await expect(canvas).toHaveAttribute("data-rendered", "true", {
      timeout: 30000,
    });
    await expect(canvas).toHaveAttribute("data-plenum-count", "2");
    await expect(canvas).toHaveAttribute("data-air-connections", /[1-9]/);
    await expect(
      page.getByText("Percorso non realizzabile: sposta curve o plenum"),
    ).toHaveCount(0);
    await openDisclosure(page, "Aspetto");
    await page
      .getByRole("checkbox", { name: "Tetto e controsoffitto trasparenti" })
      .check();
    await page.getByRole("checkbox", { name: "Nomi ambienti" }).uncheck();
    await page.getByRole("checkbox", { name: "Quota soffitto" }).uncheck();
    await page
      .getByRole("checkbox", { name: "Controsoffitto", exact: true })
      .uncheck();
    await page.getByText("Aspetto", { exact: true }).click();
    await page.screenshot({
      path: `.cache/channel-plenums-${viewport.width}.png`,
    });
  });
}
