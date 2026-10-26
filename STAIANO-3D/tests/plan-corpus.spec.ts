import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { writeFile } from "node:fs/promises";
import { test, expect } from "./browser-test";
import type corpusMetadata from "./fixtures/plan-recognition/manifest.json";
const corpus: typeof corpusMetadata = JSON.parse(
  readFileSync("tests/fixtures/plan-recognition/manifest.json", "utf8"),
);
// Private reference pixels and annotations remain in the ignored local cache.
if (
  process.env.PRIVATE_PLAN_PDF &&
  existsSync("tmp/plan-corpus/samuele-manifest.json")
) {
  corpus.push({
    ...JSON.parse(
      readFileSync("tmp/plan-corpus/samuele-manifest.json", "utf8"),
    ),
    id: "samuele-local",
    pdf: process.env.PRIVATE_PLAN_PDF,
    source: "Documento fornito localmente",
    imageWidth: 1190,
    imageHeight: 1682,
    page: 1,
  });
}

for (const sample of corpus)
  test(`PDF pubblico ${sample.id}: pagina e area conservano i riferimenti dei muri`, async ({
    page,
  }, info) => {
    const path = isAbsolute(sample.pdf)
      ? sample.pdf
      : `tmp/plan-corpus/${sample.pdf}`;
    test.skip(
      !existsSync(path),
      "Scaricare i PDF con scripts/verification/plan-corpus.py --download.",
    );
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page.getByRole("button", { name: /^Importa planimetria/ }).click();
    const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
    await dialog
      .getByLabel("File planimetria", { exact: true })
      .setInputFiles(path);
    await expect(
      dialog.getByRole("img", { name: /Anteprima planimetria/ }),
    ).toBeVisible({ timeout: 30000 });
    if (sample.page > 1) {
      await dialog
        .getByLabel("Pagina PDF", { exact: true })
        .selectOption(String(sample.page));
      await expect(dialog.getByText(/Lettura e anteprima/)).toHaveCount(0);
      await expect(
        dialog
          .locator("p")
          .filter({ hasText: `pagina ${sample.page}/` })
          .first(),
      ).toBeVisible();
    }
    const svg = dialog.getByRole("img", { name: /Anteprima planimetria/ });
    const scale = await svg.locator("image").evaluate(
      (node, dims) => ({
        x: Number(node.getAttribute("width")) / dims[0],
        y: Number(node.getAttribute("height")) / dims[1],
      }),
      [sample.imageWidth, sample.imageHeight],
    );
    await dialog
      .getByRole("button", { name: "Seleziona area da riconoscere" })
      .click();
    for (const p of [
      [sample.region[0] * scale.x, sample.region[1] * scale.y],
      [sample.region[2] * scale.x, sample.region[3] * scale.y],
    ]) {
      // Click relative to the preview so Playwright scrolls the tall plan into view.
      const position = await svg.evaluate((node, p) => {
        const q = new DOMPoint(p[0], p[1]).matrixTransform(
          (node as SVGSVGElement).getScreenCTM()!,
        );
        const box = node.getBoundingClientRect();
        return { x: q.x - box.left, y: q.y - box.top };
      }, p);
      await svg.click({ position });
    }
    await dialog
      .getByRole("button", { name: "Riconosci muri nell’area" })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Riconosci muri nell’area" }),
    ).toBeEnabled();
    await dialog.getByLabel(/^Mostra alternative da verificare/).check();
    const walls = await svg.locator("line").evaluateAll((nodes) =>
      nodes
        .filter((n) => n.textContent?.includes("Affidabilità euristica"))
        .map((n) => ({
          x: Number(n.getAttribute("x1")),
          y: Number(n.getAttribute("y1")),
          x2: Number(n.getAttribute("x2")),
          y2: Number(n.getAttribute("y2")),
        })),
    );
    expect(walls.length).toBeGreaterThan(0);
    let matches = 0,
      total = 0;
    for (const [x, y, x2, y2] of sample.wallProbes)
      for (let i = 0; i <= 30; i++) {
        total++;
        const p = {
          x: (sample.region[0] + x + ((x2 - x) * i) / 30) * scale.x,
          y: (sample.region[1] + y + ((y2 - y) * i) / 30) * scale.y,
        };
        if (
          walls.some((w) => {
            const dx = w.x2 - w.x,
              dy = w.y2 - w.y,
              len2 = dx * dx + dy * dy;
            const t = Math.max(
              0,
              Math.min(1, ((p.x - w.x) * dx + (p.y - w.y) * dy) / len2),
            );
            const dot = Math.abs(
              (dx * (x2 - x) * scale.x + dy * (y2 - y) * scale.y) /
                (Math.sqrt(len2) *
                  Math.hypot((x2 - x) * scale.x, (y2 - y) * scale.y)),
            );
            return (
              dot > 0.99 &&
              Math.hypot(p.x - w.x - t * dx, p.y - w.y - t * dy) <=
                sample.tolerancePx * Math.max(scale.x, scale.y)
            );
          })
        )
          matches++;
      }
    const coverage = matches / total;
    const referencesPath = info.outputPath("wall-references.json");
    await writeFile(
      referencesPath,
      JSON.stringify({
        source: sample.source,
        scale,
        walls,
        referenceCoverage: coverage,
        sample,
      }),
    );
    await info.attach("wall-references", {
      body: JSON.stringify({
        source: sample.source,
        page: sample.page,
        scale,
        walls,
        candidates: walls.length,
        referenceCoverage: coverage,
      }),
      contentType: "application/json",
    });
    await dialog.screenshot({ path: info.outputPath(`${sample.id}.png`) });
    expect(coverage).toBeGreaterThanOrEqual(sample.minimumCoverage);
  });
