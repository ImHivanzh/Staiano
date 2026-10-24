import { expect, test } from "./browser-test";
import { openDisclosure } from "./ui-helpers";

test("one click adds a centered door, supports undo and persists in 2D and 3D", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Disegna manualmente" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crea stanza", exact: true })
    .click();
  const wall = page.getByTestId("wall").first();
  const length = await wall
    .locator("line")
    .first()
    .evaluate((line) =>
      Math.hypot(
        Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")),
        Number(line.getAttribute("y2")) - Number(line.getAttribute("y1")),
      ),
    );
  const midpoint = await wall.locator(".muro-pianta").evaluate((line) => {
    const element = line as SVGLineElement;
    const point = new DOMPoint(
      (element.x1.baseVal.value + element.x2.baseVal.value) / 2,
      (element.y1.baseVal.value + element.y2.baseVal.value) / 2,
    ).matrixTransform(element.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(midpoint.x, midpoint.y);
  const add = page.getByRole("button", {
    name: "Aggiungi porta centrata",
    exact: true,
  });
  await openDisclosure(page.locator(".proprieta"), "Porte e finestre");
  await page
    .getByLabel("Tipo apertura", { exact: true })
    .selectOption("window");
  await page
    .getByRole("button", { name: "Aggiungi apertura", exact: true })
    .click();
  await add.click();
  await expect(
    page.getByText("Un’altra apertura occupa questa posizione della parete.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Rimuovi apertura", exact: true })
    .click();
  await add.click();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
  await expect(add).toBeDisabled();
  await openDisclosure(page.locator(".proprieta"), "Porte e finestre");
  await page
    .getByRole("button", { name: "Modifica apertura", exact: true })
    .click();
  expect(
    Number(
      await page.getByLabel("Distanza apertura", { exact: true }).inputValue(),
    ),
  ).toBeCloseTo((length - 0.9) / 2, 8);
  await expect(
    page.getByLabel("Larghezza apertura", { exact: true }),
  ).toHaveValue("0.9");
  await expect(
    page.getByLabel("Altezza apertura", { exact: true }),
  ).toHaveValue("2.1");
  await openDisclosure(page, "Modifica");
  await page.getByRole("group", { name: "Comandi rapidi progetto" })
    .getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.getByTestId("opening-2d")).toHaveCount(0);
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect(add).toBeEnabled();
  await openDisclosure(page, "Modifica");
  await page.getByRole("button", { name: "Ripeti", exact: true }).click();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("viewer-3d").locator("canvas")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await page.screenshot({
    path: testInfo.outputPath("centered-door-3d.png"),
    fullPage: true,
  });
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("opening-2d")).toHaveCount(1);
});
