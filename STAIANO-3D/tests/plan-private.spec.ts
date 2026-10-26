import { existsSync, readFileSync } from "node:fs";
import { test, expect } from "./browser-test";

test("PDF privato: muri opachi, varchi e riferimenti estranei prima e dopo calibrazione", async ({
  page,
}, info) => {
  const pdf = process.env.PRIVATE_PLAN_PDF,
    manifest = process.env.PRIVATE_PLAN_REFERENCE;
  test.skip(
    !pdf || !manifest || !existsSync(pdf) || !existsSync(manifest),
    "Impostare PDF e riferimenti privati locali; nessun documento privato viene versionato.",
  );
  test.setTimeout(120000);
  const ref = JSON.parse(readFileSync(manifest!, "utf8")) as {
    width: number;
    height: number;
    tolerancePx: number;
    walls: number[][];
    openings: number[][];
    nonWalls: number[][];
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog
    .getByLabel("File planimetria", { exact: true })
    .setInputFiles(pdf!);
  const svg = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  await expect(svg).toBeVisible({ timeout: 30000 });
  async function point(x: number, y: number) {
    await svg.scrollIntoViewIfNeeded();
    const p = await svg.evaluate(
      (node, p) => {
        const q = new DOMPoint(p[0], p[1]).matrixTransform(
          (node as SVGSVGElement).getScreenCTM()!,
        );
        const box = node.getBoundingClientRect();
        return { x: q.x - box.left, y: q.y - box.top };
      },
      [x, y],
    );
    await svg.click({ position: p });
  }
  const observations = [];
  for (const stage of ["pagina", "ritaglio-calibrato"]) {
    if (stage === "ritaglio-calibrato") {
      await dialog
        .getByRole("button", { name: "Seleziona punti scala" })
        .click();
      await point(579.647, 385.84);
      await point(1793.914, 385.84);
      await dialog.getByLabel("Distanza reale di riferimento").fill("16,40");
      await dialog
        .getByRole("button", { name: "Calibra scala", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Seleziona area da riconoscere" })
        .click();
      await point(650, 450);
      await point(1720, 1200);
      await dialog
        .getByRole("button", { name: "Riconosci con la scala verificata" })
        .click();
      await expect(
        dialog.getByRole("button", {
          name: "Riconosci con la scala verificata",
        }),
      ).toBeEnabled({ timeout: 30000 });
    }
    const walls = await svg
      .locator("line[data-candidate-id]")
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => n.textContent?.startsWith("Muri riconosciuti"))
          .map((n) => ({
            start: {
              x: Number(n.getAttribute("x1")),
              y: Number(n.getAttribute("y1")),
            },
            end: {
              x: Number(n.getAttribute("x2")),
              y: Number(n.getAttribute("y2")),
            },
          })),
      );
    function coverage(line: number[], trim = 0) {
      const [x, y, x2, y2] = line,
        dx = x2 - x,
        dy = y2 - y,
        len = Math.hypot(dx, dy);
      let hits = 0;
      for (let i = 0; i <= 100; i++) {
        const t = trim + ((1 - 2 * trim) * i) / 100,
          px = x + dx * t,
          py = y + dy * t;
        if (
          walls.some((w) => {
            const wx = w.end.x - w.start.x,
              wy = w.end.y - w.start.y,
              span = Math.hypot(wx, wy);
            if (!span || Math.abs((wx * dx + wy * dy) / (span * len)) < 0.999)
              return false;
            const q = Math.max(
              0,
              Math.min(
                1,
                ((px - w.start.x) * wx + (py - w.start.y) * wy) / (span * span),
              ),
            );
            return (
              Math.hypot(px - w.start.x - q * wx, py - w.start.y - q * wy) <=
              ref.tolerancePx
            );
          })
        )
          hits++;
      }
      return hits / 101;
    }
    const lengths = ref.walls.map(([x, y, x2, y2]) =>
      Math.hypot(x2 - x, y2 - y),
    );
    const recall =
      ref.walls.reduce((sum, w, i) => sum + coverage(w) * lengths[i], 0) /
      lengths.reduce((a, b) => a + b);
    expect(
      recall,
      "Copertura in lunghezza dei tratti murari annotati",
    ).toBeGreaterThanOrEqual(0.95);
    expect(
      ref.nonWalls.every((w) => coverage(w) === 0),
      "Cornice, cartiglio e quote restano fuori dai muri principali",
    ).toBe(true);
    expect(
      ref.openings.every((w) => coverage(w, 0.25) < 0.9),
      "Nessun vano annotato completamente chiuso da una proposta principale",
    ).toBe(true);
    observations.push({
      stage,
      primary: walls.length,
      referenceLengthCoverage: recall,
    });
    await page.screenshot({ path: info.outputPath(`${stage}.png`) });
  }
  await info.attach("risultati-privati", {
    body: JSON.stringify(observations),
    contentType: "application/json",
  });
  const before = await svg
    .locator('line[data-candidate-id][data-selected="true"]')
    .count();
  await dialog.getByLabel(/^Mostra alternative da verificare/).check();
  await expect(
    svg.locator('line[data-candidate-id][data-selected="true"]'),
  ).toHaveCount(before);
});
