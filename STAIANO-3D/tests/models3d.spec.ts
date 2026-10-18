import { expect, test } from "./browser-test";

test("manufacturer GLB preview loads locally, switches models and downloads", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Cataloghi tecnici", exact: true })
    .click();
  await page
    .getByLabel("Modello 3D", { exact: true })
    .selectOption("ardesia-2-460-1800");
  await expect(page.getByTestId("model-measured")).toContainText("493,2");
  await expect(page.getByText(/Quote da verificare: il modello/)).toBeVisible();
  await page.getByRole("button", { name: "Apri anteprima modello" }).click();
  const canvas = page.getByTestId("model-preview").locator("canvas");
  await expect(canvas).toHaveAttribute(
    "data-model",
    "/models3d/ardesia-2-460-1800.glb",
    { timeout: 30000 },
  );
  await page
    .getByLabel("Modello 3D", { exact: true })
    .selectOption("ardesia-6-460-2000");
  await expect(canvas).toHaveAttribute(
    "data-model",
    "/models3d/ardesia-6-460-2000.glb",
    { timeout: 30000 },
  );
  await expect(page.getByTestId("model-measured")).toContainText("230,1");
  await page
    .getByTestId("model-preview")
    .screenshot({ path: testInfo.outputPath("ardesia-6.png") });
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "Scarica GLB locale" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe("ardesia-6-460-2000.glb");
  await file.saveAs(testInfo.outputPath(file.suggestedFilename()));
  expect(errors).toEqual([]);
});
