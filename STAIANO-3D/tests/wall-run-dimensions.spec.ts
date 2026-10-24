import { expect, test } from "./browser-test";
import { addRectangle, createProject } from "../src/domain/project";
import { splitWall } from "../src/domain/geometry/wall-commands";
import { pickPlanPoint } from "./ui-helpers";

test("la quota del muro spezzato è unica e il valore digitato è interno", async ({
  page,
}) => {
  const empty = createProject();
  let project = addRectangle(empty, empty.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Soggiorno",
  });
  // Lo stesso lato è diviso in due segmenti collineari: deve restare una
  // sola misura.
  project = splitWall(project, project.walls[0].id, 2.65);
  await page.setViewportSize({ width: 1680, height: 1050 });
  await page.goto("/");
  await page.getByTestId("project-file").setInputFiles({
    name: "quote-fila.hvacproj",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const plan = page.getByRole("region", {
    name: "Configurazione grafica canalizzato",
  });
  await expect(plan.locator(".quota-pianta")).toHaveCount(4);
  await expect(
    plan.locator(".quota-pianta").filter({ hasText: "5,00 m" }),
  ).toHaveCount(2);

  await pickPlanPoint(plan, 1, 0);
  const length = page.getByLabel("Lunghezza muro");
  await expect(length).toHaveValue("5.000");
  await length.fill("6");
  await page.getByRole("button", { name: "Applica parete", exact: true }).click();

  await expect(
    plan.locator(".quota-pianta").filter({ hasText: "6,00 m" }),
  ).toHaveCount(1);
  await expect(length).toHaveValue("6");
  await expect(plan.locator(".quota-pianta")).toHaveCount(4);
});
