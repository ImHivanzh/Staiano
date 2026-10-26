import { test, expect } from "./browser-test";

function fixture() {
  const pairs: (string | number)[] = [
    0,
    "SECTION",
    2,
    "HEADER",
    9,
    "$INSUNITS",
    70,
    6,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
  ];
  for (const [x, y, x2, y2] of [
    [0, 0, 2, 0],
    [2, 0, 4, 0],
    [4, 0, 4, 3],
    [4, 3, 0, 3],
    [0, 3, 0, 0],
  ])
    pairs.push(0, "LINE", 8, "MURI", 10, x, 20, y, 11, x2, 21, y2);
  pairs.push(0, "ENDSEC", 0, "EOF");
  return Buffer.from(pairs.join("\n") + "\n");
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
])
  test(`selezione muri: fila, bersaglio ampio, annulla e importazione ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /^Importa planimetria/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
    await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
      name: "fila.dxf",
      mimeType: "application/dxf",
      buffer: fixture(),
    });
    await expect(
      dialog.getByLabel("Analisi automatica planimetria"),
    ).toContainText(
      "5 proposte principali · 0 alternative · 0 segmenti selezionati",
    );
    await dialog
      .getByRole("button", { name: "Seleziona", exact: true })
      .click();
    const svg = dialog.getByRole("img", { name: /Anteprima planimetria/ });
    await svg.scrollIntoViewIfNeeded();
    const hit = await svg.evaluate((node) => {
      const line = [...node.querySelectorAll("line[data-candidate-id]")].find(
        (l) =>
          Math.abs(
            Number(l.getAttribute("x2")) - Number(l.getAttribute("x1")),
          ) === 2,
      )!;
      const x =
          (Number(line.getAttribute("x1")) + Number(line.getAttribute("x2"))) /
          2,
        y =
          (Number(line.getAttribute("y1")) + Number(line.getAttribute("y2"))) /
          2;
      const p = new DOMPoint(x, y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y + 7 };
    });
    await page.mouse.click(hit.x, hit.y);
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(2);
    await dialog.getByRole("button", { name: "Escludi", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Rettangolo", exact: true })
      .click();
    for (const [x, y] of [
      [-0.03, -0.03],
      [4.03, 0.03],
    ]) {
      const p = await svg.evaluate(
        (node, p) => {
          const q = new DOMPoint(p[0], p[1]).matrixTransform(
            (node as SVGSVGElement).getScreenCTM()!,
          );
          const b = node.getBoundingClientRect();
          return { x: q.x - b.left, y: q.y - b.top };
        },
        [x, y],
      );
      await svg.click({ position: p });
    }
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Annulla selezione", exact: true })
      .click();
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(2);
    await dialog
      .getByRole("button", { name: "Annulla selezione", exact: true })
      .click();
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Ripristina selezione", exact: true })
      .click();
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(2);
    await dialog
      .getByRole("button", { name: "Seleziona proposte visibili" })
      .click();
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(5);
    await expect(
      dialog.getByRole("button", {
        name: "Importa muri selezionati (5)",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Ho verificato la scala su una misura reale")
      .check();
    await dialog
      .getByLabel(/Le geometrie selezionate rappresentano assi muro/)
      .check();
    await page.screenshot({ path: info.outputPath("wall-selection.png") });
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    await dialog
      .getByRole("button", {
        name: "Importa muri selezionati (5)",
        exact: true,
      })
      .click();
    await expect(page.getByTestId("wall")).toHaveCount(5);
  });

test.describe("iPad con tocco", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });
  test("un tocco vicino alla linea seleziona la fila senza trascinare la pianta", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Importa planimetria/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
    await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
      name: "tocco.dxf",
      mimeType: "application/dxf",
      buffer: fixture(),
    });
    await dialog.getByRole("button", { name: "Seleziona", exact: true }).tap();
    const svg = dialog.getByRole("img", { name: /Anteprima planimetria/ });
    await svg.scrollIntoViewIfNeeded();
    const p = await svg.evaluate((node) => {
      const q = new DOMPoint(1, 0).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      return { x: q.x, y: q.y + 12 };
    });
    await page.touchscreen.tap(p.x, p.y);
    await expect(
      svg.locator('line[data-candidate-id][data-selected="true"]'),
    ).toHaveCount(2);
  });
});
