import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { test, expect } from "./browser-test";
import { openDisclosure } from "./ui-helpers";
import type corpusMetadata from "./fixtures/plan-recognition/manifest.json";

const corpus: typeof corpusMetadata = JSON.parse(
  readFileSync("tests/fixtures/plan-recognition/manifest.json", "utf8"),
);
const variants = [
  {
    name: "contrasto-ridotto",
    mime: "image/png",
    extension: "png",
    factor: 1,
    angle: 0,
    contrast: 0.6,
  },
  {
    name: "jpeg-compresso",
    mime: "image/jpeg",
    extension: "jpg",
    factor: 0.75,
    angle: 0,
    contrast: 1,
  },
  {
    name: "webp-ruotato",
    mime: "image/webp",
    extension: "webp",
    factor: 1,
    angle: 3,
    contrast: 1,
  },
];

test("raster senza muri: mostra il limite, conserva lo sfondo e non inventa geometrie", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 400, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: /^Importa planimetria/ }).click();
  const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
  await dialog.getByLabel("File planimetria", { exact: true }).setInputFiles({
    name: "senza-tracciati.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(
    dialog.getByLabel("Analisi automatica planimetria"),
  ).toContainText("Nessun muro affidabile riconosciuto");
  const preview = dialog.getByRole("img", { name: /Anteprima planimetria/ });
  await expect(preview.locator("line")).toHaveCount(0);
  const box = await preview.boundingBox();
  if (!box) throw new Error("Anteprima mancante");
  await preview.click({
    position: { x: box.width * 0.3, y: box.height * 0.5 },
  });
  await preview.click({
    position: { x: box.width * 0.7, y: box.height * 0.5 },
  });
  await dialog.getByLabel("Distanza reale di riferimento").fill("4");
  await dialog
    .getByRole("button", { name: "Calibra scala", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Importa sfondo calibrato", exact: true })
    .click();
  await expect(page.getByTestId("wall")).toHaveCount(0);
  await openDisclosure(page, "Modifica");
  await expect(
    page.getByRole("button", { name: "Ricalibra", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("Salvato");
  await page.reload();
  await expect(page.getByTestId("wall")).toHaveCount(0);
  await openDisclosure(page, "Modifica");
  await expect(
    page.getByRole("button", { name: "Ricalibra", exact: true }),
  ).toBeVisible();
});

for (const sample of corpus)
  for (const variant of variants) {
    test(`${sample.id}: ${variant.name} conserva i riferimenti senza importare proposte non confermate`, async ({
      page,
    }, info) => {
      test.setTimeout(60000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/");
      const raw = gunzipSync(
        readFileSync(`tests/fixtures/plan-recognition/${sample.file}`),
      );
      const prepared = await page.evaluate(
        ({ sample, variant, encoded }) => {
          const bytes = Uint8ClampedArray.from(atob(encoded), (c) =>
            c.charCodeAt(0),
          );
          for (let i = 0; i < bytes.length; i += 4)
            for (let j = 0; j < 3; j++)
              bytes[i + j] = Math.round(
                255 - (255 - bytes[i + j]) * variant.contrast,
              );
          const source = document.createElement("canvas");
          source.width = sample.width;
          source.height = sample.height;
          source
            .getContext("2d")!
            .putImageData(
              new ImageData(bytes, sample.width, sample.height),
              0,
              0,
            );
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(sample.width * variant.factor + 80);
          canvas.height = Math.ceil(sample.height * variant.factor + 80);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const angle = (variant.angle * Math.PI) / 180;
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(angle);
          ctx.scale(variant.factor, variant.factor);
          ctx.drawImage(source, -sample.width / 2, -sample.height / 2);
          const map = (x: number, y: number) => ({
            x:
              canvas.width / 2 +
              variant.factor *
                ((x - sample.width / 2) * Math.cos(angle) -
                  (y - sample.height / 2) * Math.sin(angle)),
            y:
              canvas.height / 2 +
              variant.factor *
                ((x - sample.width / 2) * Math.sin(angle) +
                  (y - sample.height / 2) * Math.cos(angle)),
          });
          return {
            data: canvas.toDataURL(variant.mime, 0.5),
            width: canvas.width,
            height: canvas.height,
            probes: sample.wallProbes.map(([x, y, x2, y2]) => ({
              start: map(x, y),
              end: map(x2, y2),
            })),
          };
        },
        { sample, variant, encoded: raw.toString("base64") },
      );
      expect(prepared.data.startsWith(`data:${variant.mime};base64,`)).toBe(
        true,
      );
      await page.getByRole("button", { name: /^Importa planimetria/ }).click();
      const dialog = page.getByRole("dialog", { name: "Importa planimetria" });
      await dialog
        .getByLabel("File planimetria", { exact: true })
        .setInputFiles({
          name: `${sample.id}-${variant.name}.${variant.extension}`,
          mimeType: variant.mime,
          buffer: Buffer.from(prepared.data.split(",")[1], "base64"),
        });
      const analysis = dialog.getByLabel("Analisi automatica planimetria");
      await expect(analysis).toBeVisible({ timeout: 30000 });
      const automatic = Number(
        (await analysis.locator("strong").innerText()).match(
          /· (\d+) ad alta affidabilità/,
        )?.[1],
      );
      expect(Number.isFinite(automatic)).toBe(true);
      if (sample.id !== "lemon")
        expect(
          automatic,
          "Le facce di stampa e le quote del corpus restano da confermare",
        ).toBe(0);
      const svg = dialog.getByRole("img", { name: /Anteprima planimetria/ });
      const walls = await svg.locator("line").evaluateAll((nodes) =>
        nodes
          .filter((n) => n.textContent?.includes("Affidabilità euristica"))
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
      let matched = 0,
        total = 0;
      for (const probe of prepared.probes)
        for (let i = 0; i <= 30; i++) {
          total++;
          const px = probe.start.x + ((probe.end.x - probe.start.x) * i) / 30,
            py = probe.start.y + ((probe.end.y - probe.start.y) * i) / 30;
          if (
            walls.some((w) => {
              const dx = w.end.x - w.start.x,
                dy = w.end.y - w.start.y,
                len2 = dx * dx + dy * dy;
              const t = Math.max(
                0,
                Math.min(
                  1,
                  ((px - w.start.x) * dx + (py - w.start.y) * dy) / len2,
                ),
              );
              const dot = Math.abs(
                (dx * (probe.end.x - probe.start.x) +
                  dy * (probe.end.y - probe.start.y)) /
                  (Math.sqrt(len2) *
                    Math.hypot(
                      probe.end.x - probe.start.x,
                      probe.end.y - probe.start.y,
                    )),
              );
              return (
                dot > 0.99 &&
                Math.hypot(px - w.start.x - t * dx, py - w.start.y - t * dy) <=
                  sample.tolerancePx * variant.factor
              );
            })
          )
            matched++;
        }
      const coverage = matched / total;
      await writeFile(
        info.outputPath("variant-result.json"),
        JSON.stringify({
          sample: sample.id,
          variant: variant.name,
          coverage,
          candidates: walls.length,
          automatic,
          walls,
          probes: prepared.probes,
        }),
      );
      await writeFile(
        info.outputPath(`input.${variant.extension}`),
        Buffer.from(prepared.data.split(",")[1], "base64"),
      );
      await info.attach("variant-result", {
        body: JSON.stringify({
          sample: sample.id,
          variant: variant.name,
          coverage,
          candidates: walls.length,
          automatic,
        }),
        contentType: "application/json",
      });
      // Score only the manually marked wall probes. This does not certify the
      // semantic accuracy of every candidate in a furnished architectural plan.
      await info.attach("preview", {
        body: await dialog.screenshot(),
        contentType: "image/png",
      });
      expect(coverage).toBeGreaterThanOrEqual(sample.minimumCoverage);
      if (automatic === 0 && walls.length > 0) {
        await expect(
          dialog.getByLabel(/Ho verificato e confermo i muri proposti/),
        ).not.toBeChecked();
        await expect(
          dialog.getByRole("button", { name: "Importa muri selezionati" }),
        ).toBeDisabled();
      }
      if (sample.id === "unite-barn" && variant.name === "contrasto-ridotto") {
        const alternatives = dialog.getByRole("checkbox", {
          name: /^Contorni da verificare/,
        });
        await expect(alternatives).not.toBeChecked();
        await dialog
          .getByLabel(/Ho verificato e confermo i muri proposti/)
          .check();
        await expect(alternatives).not.toBeChecked();
        const opacity = await svg
          .locator("line")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              layer: node.textContent?.split(" · ")[0],
              opacity: Number(node.getAttribute("opacity")),
            })),
          );
        const primary = opacity.filter(
          (row) => row.layer === "Muri riconosciuti",
        );
        const reviewed = opacity.filter(
          (row) => row.layer === "Contorni da verificare",
        );
        expect(primary.length).toBeGreaterThan(0);
        expect(reviewed.length).toBeGreaterThan(0);
        expect(Math.max(...reviewed.map((row) => row.opacity))).toBeLessThan(
          Math.min(...primary.map((row) => row.opacity)),
        );
        await expect(page.getByTestId("wall")).toHaveCount(0);
      }
    });
  }
