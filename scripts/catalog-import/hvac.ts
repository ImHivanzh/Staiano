import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  hvacCatalogSchema,
  type HvacProduct,
} from "../../src/domain/catalogs/hvac-schema";
const root = process.cwd(),
  dir = path.join(root, "catalog-data/sources/hvac"),
  now = new Date().toISOString();
type Source = {
  name: string;
  sourceUrl: string;
  retrievedAt: string;
  sha256: string;
};
const sources = JSON.parse(
  await readFile(path.join(dir, "manifest.json"), "utf8"),
) as Source[];
function source(name: string) {
  const found = sources.find((s) => s.name === name);
  if (!found) throw new Error(`Missing official source ${name}`);
  return found;
}
function metadata(
  s: Source,
  manufacturer: string,
  page: number,
  revision: string,
) {
  return {
    manufacturer,
    sourceUrl: s.sourceUrl,
    sourceType: "pdf" as const,
    documentRevision: revision,
    retrievedAt: s.retrievedAt,
    importedAt: now,
    sha256: s.sha256,
    page,
  };
}
const products: HvacProduct[] = [];
{
  const s = source("mitsubishi-pead"),
    encoded = await readFile(path.join(dir, "mitsubishi-pead.txt"), "utf8");
  // Embedded publisher character IDs use a fixed ASCII offset, verified on the PDF.
  const text = encoded.replace(/\(cid:(\d+)\)/g, (original, n) =>
      Number(n) <= 95 ? String.fromCharCode(Number(n) + 29) : original,
    ),
    lines = text.split(/\r?\n/);
  const models =
      lines
        .find((l) => l.startsWith("UNITÀ INTERNA "))
        ?.match(/PEAD-M\d+JA2/g) ?? [],
    outdoors =
      lines
        .find((l) => l.startsWith("Unità esterna "))
        ?.match(/PUZ-ZM\d+[VY][A-Z]+2/g) ?? [];
  function capacity(temp: string) {
    const line = lines.find(
      (l) => l.startsWith("Capacità nominale (min/max)") && l.includes(temp),
    );
    return [...(line ?? "").matchAll(/(\d+(?:,\d+)?) \(([^)]+)\)/g)].map(
      (m) => Number(m[1].replace(",", ".")) * 1000,
    );
  }
  const cool = capacity("+35"),
    heat = capacity("+7"),
    dimensions = [
      ...(
        lines.find((l) => l.startsWith("Dimensioni A x L x P")) ?? ""
      ).matchAll(/(\d+)x(\d+)x(\d+)/g),
    ],
    flows = [
      ...(lines.find((l) => l.startsWith("Portata aria")) ?? "").matchAll(
        /(\d+,\d+)-(\d+,\d+)-(\d+,\d+)/g,
      ),
    ];
  if (
    [models, outdoors, cool, heat, dimensions, flows].some(
      (v) => v.length !== 7,
    )
  )
    throw new Error("Mitsubishi table changed; no column inference permitted.");
  models.forEach((indoorModel, i) =>
    products.push({
      id: `mitsubishi-${indoorModel.toLowerCase()}-${outdoors[i].toLowerCase()}`,
      manufacturer: "Mitsubishi Electric",
      family: "PEAD-M JA2 / Power Inverter",
      kind: "ducted",
      indoorModel,
      outdoorModel: outdoors[i],
      coolingCapacityW: cool[i],
      heatingCapacityW: heat[i],
      airflowOptions: ["Bassa", "Media", "Alta"].map((label, j) => ({
        label,
        airflowM3h: Number(flows[i][j + 1].replace(",", ".")) * 60,
      })),
      defaultAirflowIndex: 1,
      staticPressurePa: 50,
      staticPressureOptionsPa: [35, 50, 70, 100, 150],
      heightMm: Number(dimensions[i][1]),
      widthMm: Number(dimensions[i][2]),
      depthMm: Number(dimensions[i][3]),
      pairingVerified: true,
      availability: "published",
      technicalNotes:
        "Capacità nominali a T+35°C/T+7°C. Portata di calcolo alla velocità Media pubblicata, non media aritmetica. Pressione statica50Pa predefinita dal produttore. Pdesign non confuso con capacità nominale.",
      sourceMetadata: metadata(
        s,
        "Mitsubishi Electric",
        1,
        "PEAD-M JA2 — scheda5027",
      ),
    }),
  );
}
for (const curatedFile of ["daikin-fba.json", "daikin-fba-large.json"]) {
  const curated = JSON.parse(
      await readFile(
        path.join(root, "catalog-data/curation", curatedFile),
        "utf8",
      ),
    ) as {
      sourceName: string;
      sourceSha256: string;
      page: number;
      revision: string;
      products: {
        indoorModel: string;
        outdoorModel: string;
        coolingCapacityW: number;
        heatingCapacityW: number;
        widthMm: number;
        heightMm: number;
        depthMm: number;
        airflowOptionsM3min: number[];
        staticPressurePa?: number;
      }[];
    },
    s = source(curated.sourceName);
  if (s.sha256 !== curated.sourceSha256)
    throw new Error(
      "Daikin source changed. Reverify merged manufacturer cells.",
    );
  curated.products.forEach((p) =>
    products.push({
      id: `daikin-${p.indoorModel.toLowerCase()}-${p.outdoorModel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      manufacturer: "Daikin",
      family:
        curatedFile === "daikin-fba-large.json"
          ? "FBA-A(9) / Sky Air Advance"
          : "FBA-A9 / RXM",
      kind: "ducted",
      indoorModel: p.indoorModel,
      outdoorModel: p.outdoorModel,
      coolingCapacityW: p.coolingCapacityW,
      heatingCapacityW: p.heatingCapacityW,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      depthMm: p.depthMm,
      airflowOptions: ["Bassa", "Media", "Alta"].map((label, i) => ({
        label,
        airflowM3h: p.airflowOptionsM3min[i] * 60,
      })),
      defaultAirflowIndex: 1,
      staticPressurePa: p.staticPressurePa ?? 30,
      staticPressureOptionsPa: [p.staticPressurePa ?? 30, 150],
      pairingVerified: true,
      availability: "published",
      technicalNotes:
        curatedFile === "daikin-fba-large.json"
          ? "Celle unite verificate sul PDF p.90: FBA100/125/140 condividono dimensioni;125/140 portate e pressione. Calcolo alla velocità Media. Abbinamenti monofase MV; suffisso(1) mantenuto dalla scheda originale, da precisare per l'ordine. La pubblicazione2025 non conferma disponibilità a magazzino."
          : "Celle unite verificate sul PDF: taglie35/50 condividono dimensioni e portate. Calcolo alla velocità Media. RXM50A(9) mantiene la designazione della scheda originale, da precisare per l'ordine.",
      sourceMetadata: metadata(s, "Daikin", curated.page, curated.revision),
    }),
  );
}
{
  const s = source("gree-technical-sales"),
    pages = JSON.parse(
      await readFile(path.join(dir, "gree-technical-sales.pages.json"), "utf8"),
    ) as string[];
  const groups = [
    pages.findIndex(
      (t) => t.includes("4.2 Duct Type Data") && t.includes("600/550/500/400"),
    ),
    pages.findIndex(
      (t) => t.includes("GUD100PHS1/A-S") && t.includes("1700/1600/1400/1200"),
    ),
  ];
  if (groups.some((i) => i < 0))
    throw new Error("Gree duct specification pages missing");
  for (const index of groups) {
    const block =
      index === groups[1]
        ? pages[index].slice(pages[index].indexOf("GUD100PH1/A-S"))
        : pages[index];
    const lines = block.split(/\r?\n/),
      models =
        lines
          .find((l) => l.startsWith("Model GUD"))
          ?.match(/GUD\d+P(?:H)?S1\/A-S/g) ?? [],
      outdoors =
        lines
          .find((l) => l.startsWith("Outdoor Unit GUD"))
          ?.match(/GUD\d+W1\/NhA-S/g) ?? [],
      cool = (lines.find((l) => l.startsWith("Cooling kW ")) ?? "")
        .split(" ")
        .slice(2)
        .map((v) => Number(v) * 1000),
      heat = (lines.find((l) => l.startsWith("Heating kW ")) ?? "")
        .split(" ")
        .slice(2)
        .map((v) => Number(v) * 1000),
      flows = [...block.matchAll(/\d+\/\d+\/\d+\/\d+/g)].filter(
        (m) => Number(m[0].split("/")[0]) > 100,
      ),
      dims = [
        ...(lines.find((l) => l.includes("Outline mm")) ?? "").matchAll(
          /(\d+)×(\d+)×(\d+)/g,
        ),
      ],
      pressureLine = lines.find((l) => /^(?:Pressure )?Pa \d/.test(l)) ?? "",
      pressure = (pressureLine.match(/\d+/g) ?? []).map(Number);
    if (
      !models.length ||
      [outdoors, cool, heat, flows, dims, pressure].some(
        (a) => a.length !== models.length,
      )
    )
      throw new Error(
        `Gree column mismatch on PDF page${index + 1}: ${[models, outdoors, cool, heat, flows, dims, pressure].map((a) => a.length).join(",")}`,
      );
    models.forEach((indoorModel, i) =>
      products.push({
        id: `gree-${indoorModel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${outdoors[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        manufacturer: "Gree",
        family: "U-Match VI / R32",
        kind: "ducted",
        indoorModel,
        outdoorModel: outdoors[i],
        coolingCapacityW: cool[i],
        heatingCapacityW: heat[i],
        airflowOptions: [
          "Massima (SH)",
          "Alta (H)",
          "Media (M)",
          "Bassa (L)",
        ].map((label, j) => ({
          label,
          airflowM3h: Number(flows[i][0].split("/")[j]),
        })),
        defaultAirflowIndex: 2,
        staticPressurePa: pressure[i],
        staticPressureOptionsPa: [pressure[i]],
        widthMm: Number(dims[i][1]),
        depthMm: Number(dims[i][2]),
        heightMm: Number(dims[i][3]),
        pairingVerified: true,
        availability: "published",
        technicalNotes:
          "Specifiche originali Gree U-MatchVI: quattro velocità SH/H/M/L. Calcolo alla velocità M pubblicata. Pressione statica standard dalla tabella, non massima. Modello con pompa condensa; capacità e portate condivise con modello senza pompa nella stessa colonna. Dati dal produttore, pubblicati nel suo canale tecnico regionale; verifica disponibilità commerciale in Italia.",
        sourceMetadata: metadata(
          s,
          "Gree",
          index + 1,
          "U-MatchVI — Technical Sales Guide",
        ),
      }),
    );
  }
}
const catalog = hvacCatalogSchema.parse({
  version: `${now.slice(0, 10)}-hvac-${createHash("sha256")
    .update(
      JSON.stringify(
        products.map((p) => ({
          ...p,
          sourceMetadata: { sha256: p.sourceMetadata.sha256 },
        })),
      ),
    )
    .digest("hex")
    .slice(0, 12)}`,
  products,
});
const output = path.join(root, "catalog-data/generated");
await mkdir(output, { recursive: true });
const target = path.join(output, "hvac.json"),
  staging = path.join(output, "hvac.staging.json");
await writeFile(staging, JSON.stringify(catalog, null, 2));
const previous = existsSync(target)
  ? hvacCatalogSchema.parse(JSON.parse(await readFile(target, "utf8")))
  : null;
const normalized = (p: HvacProduct) =>
  JSON.stringify({
    ...p,
    sourceMetadata: {
      ...p.sourceMetadata,
      importedAt: null,
      retrievedAt: null,
    },
  });
const report = {
  imported: catalog.products.length,
  added: catalog.products
    .filter((p) => !previous?.products.some((old) => old.id === p.id))
    .map((p) => p.id),
  changed: catalog.products
    .filter((p) => {
      const old = previous?.products.find((v) => v.id === p.id);
      return old && normalized(old) !== normalized(p);
    })
    .map((p) => p.id),
  removed:
    previous?.products
      .filter((p) => !catalog.products.some((v) => v.id === p.id))
      .map((p) => p.id) ?? [],
  errors: 0,
};
await writeFile(
  path.join(output, "hvac.report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
console.log(
  JSON.stringify({
    imported: catalog.products.length,
    manufacturers: [...new Set(catalog.products.map((p) => p.manufacturer))],
    errors: 0,
  }),
);
if (process.argv.includes("--apply")) {
  if (report.removed.length && !process.argv.includes("--allow-removal"))
    throw new Error("Removed HVAC products detected. Review before applying.");
  const historyPath = path.join(output, "hvac-history.json"),
    history = existsSync(historyPath)
      ? JSON.parse(await readFile(historyPath, "utf8"))
      : {};
  for (const file of [path.join(output, "hvac.previous.json"), target])
    if (existsSync(file)) {
      const old = hvacCatalogSchema.parse(
        JSON.parse(await readFile(file, "utf8")),
      );
      history[old.version] = old;
    }
  if (existsSync(target))
    await copyFile(target, path.join(output, "hvac.previous.json"));
  history[catalog.version] = catalog;
  await writeFile(historyPath, JSON.stringify(history, null, 2));
  await copyFile(staging, target);
} else console.log("Staged only. Review then --apply.");
