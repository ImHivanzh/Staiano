import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  radiatorCatalogSchema,
  type RadiatorVariant,
} from "../../src/domain/catalogs/radiator-schema";

const root = process.cwd(),
  dir = path.join(root, "catalog-data"),
  sourceDir = path.join(dir, "sources");
const manifest = JSON.parse(
  await readFile(path.join(sourceDir, "manifest.json"), "utf8"),
) as { name: string; sourceUrl: string; retrievedAt: string; sha256: string }[];
const brand = process.argv.includes("--global") ? "Global" : "Cordivari";
const now = new Date().toISOString();
function metadata(name: string, page: number, revision: string) {
  const source = manifest.find((s) => s.name === name);
  if (!source) throw new Error(`Missing source ${name}. Run acquire.py first.`);
  return {
    manufacturer: brand,
    sourceUrl: source.sourceUrl,
    sourceType: "pdf" as const,
    documentRevision: revision,
    retrievedAt: source.retrievedAt,
    importedAt: now,
    sha256: source.sha256,
    page,
  };
}
const decimal = (n: string) => Number(n.replace(",", "."));
const products: RadiatorVariant[] = [];
if (brand === "Cordivari") {
  for (const columns of [2, 3, 4, 5, 6]) {
    const name = `cordivari-ardesia-${columns}`,
      text = await readFile(path.join(sourceDir, `${name}.txt`), "utf8");
    function row(label: string) {
      const line = text.split(/\r?\n/).find((l) => l.startsWith(label));
      if (!line) throw new Error(`Missing ${label} in ${name}`);
      const remainder = line.slice(label.length).split(label)[0];
      return (remainder.match(/\d+(?:,\d+)?/g) ?? []).map(decimal);
    }
    const heights = row("Altezza H [mm]"),
      interaxes = row("Interasse I [mm]"),
      outputs = row("(75/65/20°C) ΔT 50 = W"),
      outputs30 = row("(55/45/20°C) ΔT 30 = W"),
      water = row("Contenuto acqua [lt]"),
      weights = row("Peso a vuoto [kg]"),
      n = row("Esponente [n]"),
      flow = row("Portata nominale [kg/h]");
    if (
      heights.length !== 27 ||
      [interaxes, outputs, outputs30, water, weights, n, flow].some(
        (r) => r.length !== heights.length,
      )
    )
      throw new Error(`Unexpected table structure in ${name}. Do not guess.`);
    const counts = [
      ...new Set(
        [...text.matchAll(/(?:^|\n)(\d+)\s*\n(\d+) mm W/g)].map((m) =>
          Number(m[1]),
        ),
      ),
    ].sort((a, b) => a - b);
    if (!counts.length) throw new Error(`No commercial batteries in ${name}`);
    heights.forEach((heightMm, i) =>
      products.push({
        id: `cordivari-ardesia-${columns}-${heightMm}`,
        manufacturer: brand,
        family: `Ardesia ${columns} colonne`,
        model: `Ardesia ${columns} colonne H${heightMm}`,
        code: null,
        columns,
        heightMm,
        interaxisMm: interaxes[i],
        depthMm: (
          { 2: 66, 3: 107, 4: 148, 5: 189, 6: 230 } as Record<number, number>
        )[columns],
        pitchMm: 46,
        widthAdditionMm: 24,
        widthNote:
          "L = elementi × 46 mm; ingombro con tappi L+24. Valvole escluse (Kristal: +90 mm, quota superiore +122 mm ±1,5%). Disegno ufficiale p.2.",
        commercialElementCounts: counts,
        elementOutputW: outputs[i],
        elementOutput30W: outputs30[i],
        referenceDeltaTK: 50,
        exponentN: n[i],
        coefficientKm: null,
        waterContentL: water[i],
        weightKg: weights[i],
        nominalFlowKgh: flow[i],
        maxPressureBar: 10,
        maxTemperatureC: 110,
        connections: '1" G',
        sourceMetadata: metadata(
          name,
          1,
          "2025 — scheda collegata dal sito ufficiale",
        ),
      }),
    );
  }
} else {
  for (const family of ["VIP", "OSCAR", "OSCAR TONDO"]) {
    const name =
        family === "VIP" ? "global-vip-technical" : "global-oscar-technical",
      text = await readFile(path.join(sourceDir, `${name}.txt`), "utf8");
    const limits = text.match(
      /(\d+)°\s*C con pressione di esercizio[^\r\n]*?-\s*(\d+)\s*Bar\./,
    );
    if (!limits)
      throw new Error(
        `Operating limits missing from official ${name} document`,
      );
    const rows = [
      ...new Set(
        text
          .split(/\r?\n/)
          .map(
            (l) =>
              l.match(
                new RegExp(`${family} \\d+ \\d+ 80 95 \\d+ 1[”"] .*`),
              )?.[0],
          )
          .filter((l): l is string => !!l),
      ),
    ];
    if (rows.length !== (family === "VIP" ? 5 : 7))
      throw new Error(`Expected complete ${family} table, got ${rows.length}`);
    for (const row of rows) {
      const tokens = row.slice(family.length).trim().split(/\s+/);
      const interaxis = Number(tokens.shift());
      const nums = tokens.filter((t) => /^\d+(?:,\d+)?$/.test(t)).map(decimal);
      if (nums.length !== 10)
        throw new Error(`Unexpected row ${row}: ${nums.length} numeric fields`);
      const [
        heightMm,
        pitchMm,
        depthMm,
        interaxisMm,
        weightKg,
        waterContentL,
        elementOutputW,
        elementOutput30W,
        exponentN,
        coefficientKm,
      ] = nums;
      products.push({
        id: `global-${family.toLowerCase().replaceAll(" ", "-")}-${interaxis}`,
        manufacturer: brand,
        family,
        model: `${family} ${interaxis}`,
        code: null,
        columns: null,
        heightMm,
        interaxisMm,
        depthMm,
        pitchMm,
        widthAdditionMm: 0,
        widthNote:
          "Batteria = elementi × 80 mm; valvole e accessori esclusi. Dimensioni per elemento da scheda ufficiale.",
        commercialElementCounts: Array.from(
          {
            length: (family === "VIP" ? (interaxis >= 700 ? 12 : 14) : 10) - 1,
          },
          (_, i) => i + 2,
        ),
        elementOutputW,
        elementOutput30W,
        referenceDeltaTK: 50,
        exponentN,
        coefficientKm,
        waterContentL,
        weightKg,
        nominalFlowKgh: null,
        maxPressureBar: Number(limits[2]),
        maxTemperatureC: Number(limits[1]),
        connections: '1"',
        sourceMetadata: metadata(
          name,
          family === "VIP" ? 2 : 4,
          family === "VIP" ? "vipIT24" : "Oscar/OscarTondo — 2025",
        ),
      });
    }
  }
}
const catalog = radiatorCatalogSchema.parse({
  version: `${now.slice(0, 10)}-${brand.toLowerCase()}-${createHash("sha256")
    .update(
      JSON.stringify(
        products.map((p) => ({
          ...p,
          sourceMetadata: {
            sourceUrl: p.sourceMetadata.sourceUrl,
            sha256: p.sourceMetadata.sha256,
            documentRevision: p.sourceMetadata.documentRevision,
            page: p.sourceMetadata.page,
          },
        })),
      ),
    )
    .digest("hex")
    .slice(0, 12)}`,
  manufacturer: brand,
  products,
});
const outputDir = path.join(dir, "generated");
await mkdir(outputDir, { recursive: true });
const target = path.join(outputDir, `${brand.toLowerCase()}.json`),
  staging = target.replace(".json", ".staging.json");
const old = existsSync(target)
  ? radiatorCatalogSchema.parse(JSON.parse(await readFile(target, "utf8")))
  : null;
const removed =
  old?.products
    .filter((p) => !products.some((v) => v.id === p.id))
    .map((p) => p.id) ?? [];
const added = products.filter(
  (p) => !old?.products.some((v) => v.id === p.id),
).length;
const changed = catalog.products.filter((p) => {
  const prev = old?.products.find((v) => v.id === p.id);
  if (!prev) return false;
  const a: Record<string, unknown> = { ...prev },
    b: Record<string, unknown> = { ...p };
  delete a.sourceMetadata;
  delete b.sourceMetadata;
  return JSON.stringify(a) !== JSON.stringify(b);
}).length;
const report = {
  imported: products.length,
  added,
  changed,
  removed,
  warnings: products.filter((p) => p.code === null).length,
  errors: 0,
  skipped: 0,
};
await writeFile(staging, JSON.stringify(catalog, null, 2));
await writeFile(
  path.join(outputDir, `${brand.toLowerCase()}.report.json`),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
if (process.argv.includes("--apply")) {
  if (removed.length && !process.argv.includes("--allow-removal"))
    throw new Error(
      "Removed products detected. Review report; use --allow-removal only after explicit review.",
    );
  const historyPath = path.join(outputDir, "radiator-history.json");
  const history = existsSync(historyPath)
    ? JSON.parse(await readFile(historyPath, "utf8"))
    : {};
  if (old) {
    history[old.version] = old;
    await copyFile(target, target.replace(".json", ".previous.json"));
  }
  history[catalog.version] = catalog;
  await writeFile(historyPath, JSON.stringify(history, null, 2));
  await copyFile(staging, target);
  console.log(`Applied ${target}`);
} else console.log("Staged only. Review report, then run with --apply.");
