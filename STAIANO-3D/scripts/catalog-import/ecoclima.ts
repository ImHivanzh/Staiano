import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  airTerminalCatalogSchema,
  type AirTerminalFamily,
  type AirTerminalVariant,
  type OperatingPoint,
} from "../../src/domain/catalogs/air-terminal-schema";
const root = process.cwd(),
  dir = path.join(root, "catalog-data/sources/ecoclima");
type Document = {
  filename: string;
  sourceUrl: string;
  label: string;
  retrievedAt: string;
  sha256: string;
};
const records = JSON.parse(
  await readFile(path.join(dir, "discovery.json"), "utf8"),
) as { code: string; documents: Document[] }[];
const document = records.find((r) => r.code === "EDLS")?.documents[0];
if (!document) throw new Error("EDLS official source missing.");
const text = await readFile(
  path.join(dir, document.filename.replace(".pdf", ".txt")),
  "utf8",
);
const blocks = [...text.matchAll(/EDLS-EDLSB\s+([123]) FERITOI[AE]/g)];
if (blocks.length !== 3)
  throw new Error("Unexpected EDLS table topology. Review official revision.");
const variants = blocks.flatMap((match, i) => {
  const block = text.slice(match.index!, blocks[i + 1]?.index ?? text.length),
    slots = Number(match[1]);
  const numbers = (label: RegExp) => {
    const row = block.match(label)?.[1];
    if (!row) throw new Error("EDLS operating row missing");
    return row
      .trim()
      .split(/\s+/)
      .map((s) => Number(s.replace(",", ".")));
  };
  const flows = [...block.matchAll(/m³\/h\s+([\d ,]+)/g)]
    .slice(0, 2)
    .map((m) => m[1].trim().split(/\s+/).map(Number));
  const throws = [...block.matchAll(/L\(m\)\s+([\d ,]+)/g)]
    .slice(0, 2)
    .map((m) =>
      m[1]
        .trim()
        .split(/\s+/)
        .map((s) => Number(s.replace(",", "."))),
    );
  const velocity = numbers(/Vk m\/s ([\d ]+)/),
    pressure = numbers(/Perdite di carico Pa ([\d ]+)/);
  const noise = block
    .match(/indice di rumorosità dB\(A\) ([<\d ]+)/)?.[1]
    .trim()
    .split(/\s+/);
  const areas = [...block.matchAll(/0,\d{4}/g)]
    .slice(0, 2)
    .map((m) => Number(m[0].replace(",", ".")));
  if (
    flows.length !== 2 ||
    throws.length !== 2 ||
    areas.length !== 2 ||
    [velocity, pressure, noise, ...flows, ...throws].some(
      (r) => r?.length !== 6,
    )
  )
    throw new Error(`Incomplete operating data for ${slots} slots`);
  return [20, 30].map((slotWidthMm, j) => ({
    id: `ecoclima-edls-${slots}f-${slotWidthMm}`,
    widthMm:
      slots === 1
        ? slotWidthMm === 20
          ? 60
          : 70
        : slots === 2
          ? slotWidthMm === 20
            ? 100
            : 120
          : slotWidthMm === 20
            ? 140
            : 170,
    heightMm: null,
    depthMm: null,
    lengthMm: null,
    slotWidthMm,
    slotCount: slots,
    commercialLengthsMm: [800, 1000, 1200, 1500, 2000],
    effectiveAreaM2: areas[j],
    operatingPoints: flows[j].map((airflowM3h, k) => ({
      airflowM3h,
      airflowPerMeterM3h: airflowM3h,
      velocityMs: velocity[k],
      pressureDropPa: pressure[k],
      throwM: throws[j][k],
      noiseDbA: noise![k].startsWith("<") ? null : Number(noise![k]),
      noiseUpperBoundDbA: noise![k].startsWith("<")
        ? Number(noise![k].slice(1))
        : null,
      noiseLabel: noise![k],
      referenceLengthM: 1,
    })),
  }));
});
const now = new Date().toISOString();
const catalog = airTerminalCatalogSchema.parse({
  version: `${now.slice(0, 10)}-ecoclima-1`,
  families: [
    {
      manufacturer: "Ecoclima",
      familyCode: "EDLS",
      name: "Diffusore lineare a scomparsa",
      description:
        "Profilo in alluminio, una, due o tre feritoie da 20 o 30 mm; deflettori regolabili. EDLS nero e EDLSB bianco.",
      type: "linear",
      mountingType: "Soffitto in cartongesso",
      use: ["supply"],
      isLinearPerMeter: true,
      image: null,
      operatingConditions:
        "Dati per 1 m, Vt 0,25 m/s, montaggio a filo soffitto, lancio laterale Coanda, senza serranda e deflettori al 50%. Valori di ripresa e rumore totale di linee con lunghezza diversa richiedono verifica; non vengono stimati.",
      variants,
      sourceMetadata: {
        manufacturer: "Ecoclima",
        sourceUrl: document.sourceUrl,
        sourceType: "pdf",
        documentRevision: document.label.replace(/\s+/g, " ").trim(),
        retrievedAt: document.retrievedAt,
        importedAt: now,
        sha256: document.sha256,
        page: null,
      },
    },
  ],
});
async function source(code: string, exclude?: string) {
  const record = (
    records as { code: string; pageUrl?: string; documents: Document[] }[]
  ).find((r) => r.code === code && (!exclude || !r.pageUrl?.includes(exclude)));
  if (!record?.documents[0]) throw new Error(`Missing ${code} source`);
  const d = record.documents[0];
  return {
    text: await readFile(
      path.join(dir, d.filename.replace(".pdf", ".txt")),
      "utf8",
    ),
    metadata: {
      manufacturer: "Ecoclima",
      sourceUrl: d.sourceUrl,
      sourceType: "pdf" as const,
      documentRevision: d.label.replace(/\s+/g, " ").trim(),
      retrievedAt: d.retrievedAt,
      importedAt: now,
      sha256: d.sha256,
      page: null,
    },
  };
}
function point(
  q: number,
  velocity: number,
  pa: number,
  noise: string,
  throwM: number | null,
  area: number,
): OperatingPoint {
  const bound = noise.startsWith("<")
    ? Number(noise.slice(1))
    : Math.max(...noise.split("/").map(Number));
  const quality =
    Math.abs(q / (area * 3600 * velocity) - 1) > 0.15 ? "review" : "valid";
  return {
    airflowM3h: q,
    airflowPerMeterM3h: null,
    velocityMs: velocity,
    pressureDropPa: pa,
    throwM,
    noiseDbA:
      noise.includes("/") || noise.startsWith("<") ? null : Number(noise),
    noiseUpperBoundDbA:
      noise.includes("/") || noise.startsWith("<") ? bound : null,
    noiseLabel: noise,
    referenceLengthM: null,
    quality,
    qualityNote:
      quality === "review"
        ? "Portata discordante rispetto a sezione efficace × velocità. Dato originale conservato, escluso da selezione automatica."
        : null,
  };
}
for (const code of ["EBLF", "ETA"]) {
  const s = await source(code),
    rows = [...s.text.matchAll(/^(\d+)x(\d+) (0,\d+) ([\d ,]+)(?: .*?)?$/gm)];
  const used = new Set<string>();
  const normalized: AirTerminalVariant[] = [];
  for (const row of rows) {
    const width = Number(row[1]),
      height = Number(row[2]),
      area = Number(row[3].replace(",", ".")),
      id = `ecoclima-${code.toLowerCase()}-${width}x${height}`;
    if (used.has(id)) continue;
    used.add(id);
    const values = row[4]
      .trim()
      .split(/\s+/)
      .map((n) => Number(n.replace(",", ".")));
    if (values.length !== (code === "EBLF" ? 6 : 3))
      throw new Error(`Unexpected ${code} row ${row[0]}`);
    const velocities = code === "EBLF" ? [2, 3, 4] : [0.8, 1, 1.5],
      pa = code === "EBLF" ? [3, 7, 12] : [7, 10, 20],
      noise =
        code === "EBLF"
          ? ["15/20", "28/32", "38/42"]
          : ["25/30", "30/35", "40/45"];
    normalized.push({
      id,
      widthMm: width,
      heightMm: height,
      depthMm: null,
      lengthMm: null,
      slotWidthMm: null,
      slotCount: null,
      commercialLengthsMm: [],
      effectiveAreaM2: area,
      operatingPoints: velocities.map((v, i) =>
        point(
          values[code === "EBLF" ? i * 2 : i],
          v,
          pa[i],
          noise[i],
          code === "EBLF" ? values[i * 2 + 1] : null,
          area,
        ),
      ),
    });
  }
  if (normalized.length !== (code === "EBLF" ? 42 : 18))
    throw new Error(`Incomplete ${code} variants: ${normalized.length}`);
  const family: AirTerminalFamily = {
    manufacturer: "Ecoclima",
    familyCode: code,
    name:
      code === "EBLF"
        ? "Bocchetta lineare a barre senza cornice"
        : "Griglia di transito antiluce",
    description:
      code === "EBLF"
        ? "Bocchetta in alluminio con barre fisse a 0° o 15°. Dati per dimensione discreta, non per metro."
        : "Griglia in alluminio per equilibrio di pressione tra locali, con profilo antiluce.",
    type: "grille",
    mountingType:
      code === "EBLF" ? "Parete o cartongesso" : "Parete divisoria o porta",
    use: code === "EBLF" ? ["supply"] : ["transfer"],
    isLinearPerMeter: false,
    image: null,
    operatingConditions:
      code === "EBLF"
        ? "Lancio a Vt0,25m/s, montaggio entro3m dal soffitto. Rumore dato come intervallo: selezione usa il limite superiore. Dimensioni75/100mm non disponibili su muratura."
        : "Griglia di transito, distinta da terminali di mandata/ripresa. Rumore come intervallo, nessuna stima del valore esatto.",
    variants: normalized,
    sourceMetadata: s.metadata,
  };
  catalog.families.push(family);
}
{
  const s = await source("EGQ", "push"),
    widths = [200, 300, 400, 500, 600, 800, 1000, 1200],
    heights = [100, 150, 200, 300, 400, 500, 600, 800, 1000];
  const areaRows = [
    ...s.text.matchAll(/^(\d+) ((?:0,\d+|1,\d+)(?: (?:0,\d+|1,\d+)){7})$/gm),
  ];
  if (areaRows.length !== 9) throw new Error("EGQ area table changed");
  const flowBlock = s.text.slice(
    s.text.indexOf("DATI DI FUNZIONAMENTO"),
    s.text.indexOf("Vk:", s.text.indexOf("DATI DI FUNZIONAMENTO")),
  );
  const rows = flowBlock
    .split(/\r?\n/)
    .filter((l) => /^\d+(?: \d+){9,} (?:<20|\d+\/\d+)$/.test(l));
  if (rows.length !== 27)
    throw new Error(`Incomplete EGQ operating table: ${rows.length}`);
  const normalized: AirTerminalVariant[] = heights.flatMap((height, h) => {
    const areas = areaRows[h][2]
      .split(" ")
      .map((n) => Number(n.replace(",", ".")));
    return widths.map((width, j) => {
      const operatingPoints = [0, 1, 2].map((speed) => {
        const t = rows[h * 3 + speed].split(" ");
        if (speed === 1) {
          const declaredHeight = Number(t.shift());
          if (declaredHeight !== height) throw new Error("EGQ height mismatch");
        }
        const velocity = Number(t.shift()),
          noise = t.pop()!,
          pa = Number(t.pop()),
          q = Number(t[j]);
        const p = point(q, velocity, pa, noise, null, areas[j]);
        if (areas[j] > (width * height) / 1e6) {
          p.quality = "review";
          p.qualityNote =
            "Sezione efficace maggiore della superficie nominale. Dato originale conservato, da verificare.";
        }
        return p;
      });
      return {
        id: `ecoclima-egq-${width}x${height}`,
        widthMm: width,
        heightMm: height,
        depthMm: null,
        lengthMm: null,
        slotWidthMm: null,
        slotCount: null,
        commercialLengthsMm: [],
        effectiveAreaM2: areas[j],
        operatingPoints,
      };
    });
  });
  catalog.families.push({
    manufacturer: "Ecoclima",
    familyCode: "EGQ",
    name: "Griglia di ripresa a maglia quadra",
    description:
      "Griglia in alluminio con maglia13×13mm per ripresa aria, senza filtro.",
    type: "grille",
    mountingType: "Parete o soffitto",
    use: ["return"],
    isLinearPerMeter: false,
    image: null,
    operatingConditions:
      "Rumore dichiarato come limite o intervallo; selezione usa il limite superiore. Varianti discordanti conservate e non selezionabili automaticamente.",
    variants: normalized,
    sourceMetadata: s.metadata,
  });
}
{
  const s = await source("EVVMC"),
    cellData = JSON.parse(
      await readFile(path.join(dir, "evvmc-operating-points.json"), "utf8"),
    ) as {
      source: Document;
      points: {
        model: string;
        airflowM3h: number;
        openingMm: number;
        pressureDropPa: number;
        noiseDbA: number;
      }[];
    };
  if (cellData.source.sha256 !== s.metadata.sha256)
    throw new Error(
      "EVVMC extracted table refers to a different PDF. Re-extract.",
    );
  const dimensions = [
    ...s.text.matchAll(/^EVVMC - EVVMB (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/gm),
  ];
  if (dimensions.length !== 6 || cellData.points.length !== 45)
    throw new Error("Incomplete EVVMC table");
  const valveVariants: AirTerminalVariant[] = dimensions.map((m) => {
    const [nominal, A, B, C, D, E] = m.slice(1).map(Number);
    const rows = cellData.points.filter((p) =>
      (p.model.match(/\d+/g) ?? []).map(Number).includes(nominal),
    );
    return {
      id: `ecoclima-evvmc-${nominal}`,
      widthMm: A,
      heightMm: null,
      depthMm: null,
      lengthMm: null,
      slotWidthMm: null,
      slotCount: null,
      commercialLengthsMm: [],
      effectiveAreaM2: null,
      nominalDiameterMm: nominal,
      originalDimensionsMm: { A, B, C, D, E },
      operatingPoints: rows.map((r) => ({
        airflowM3h: r.airflowM3h,
        airflowPerMeterM3h: null,
        velocityMs: null,
        pressureDropPa: r.pressureDropPa,
        throwM: null,
        noiseDbA: r.noiseDbA,
        noiseUpperBoundDbA: null,
        noiseLabel: String(r.noiseDbA),
        referenceLengthM: null,
        openingMm: r.openingMm,
        quality: "valid",
        qualityNote: null,
      })),
    };
  });
  catalog.families.push({
    manufacturer: "Ecoclima",
    familyCode: "EVVMC",
    name: "Valvola di mandata EVVMC / EVVMB",
    description:
      "Valvola in acciaio con cono centrale regolabile. Diametri nominali80–200mm. EVVMC RAL9010, EVVMB RAL9016.",
    type: "valve",
    mountingType: "Soffitto o canale",
    use: ["supply"],
    isLinearPerMeter: false,
    image: null,
    operatingConditions:
      "Prestazioni dipendenti dall'aperturaS del cono, espressa inmm. S può essere negativo. Dati originali senza interpolazione, lancio e velocità non dichiarati nelle righe.",
    variants: valveVariants,
    sourceMetadata: s.metadata,
  });
}
{
  const htmlData = JSON.parse(
    await readFile(path.join(dir, "html-tables.json"), "utf8"),
  ) as Record<
    string,
    { sourceUrl: string; sha256: string; tables: string[][][] }
  >;
  const original = htmlData.EGS,
    rows = original.tables[0],
    variants: AirTerminalVariant[] = [];
  for (const row of rows) {
    const index = row.findIndex((s) => /^\d+x\d+$/.test(s));
    if (index < 0) continue;
    const [w, h] = row[index].split("x").map(Number),
      area = Number(row[index + 1].replace(",", ".")),
      flows = row.slice(index + 2, index + 6).map(Number);
    if (flows.length !== 4 || flows.some((n) => !Number.isFinite(n)))
      throw new Error("EGS operating row incomplete");
    variants.push({
      id: `ecoclima-egs-${w}x${h}`,
      widthMm: w,
      heightMm: h,
      depthMm: null,
      lengthMm: null,
      slotWidthMm: null,
      slotCount: null,
      commercialLengthsMm: [],
      effectiveAreaM2: area,
      faceWidthMm: w,
      faceHeightMm: h,
      bodyDepthMm: null,
      operatingPoints: flows.map((q, i) =>
        point(
          q,
          i + 2,
          [3, 6, 10, 15][i],
          ["20/25", "25/30", "30/35", "35/40"][i],
          null,
          area,
        ),
      ),
    });
  }
  if (variants.length !== 11) throw new Error("EGS dimensional table changed");
  catalog.families.push({
    manufacturer: "Ecoclima",
    familyCode: "EGS",
    name: "Griglia stampata in acciaio",
    description:
      "Griglia di mandata o aspirazione in acciaio grigio, per climatizzazione e ventilazione.",
    type: "grille",
    mountingType: "Parete",
    use: ["supply", "return"],
    isLinearPerMeter: false,
    image: null,
    mountings: ["wall"],
    shape: "rectangle",
    geometryNote:
      "Dimensioni frontali nominali L×H dal produttore. Spessore completo non disponibile.",
    operatingConditions:
      "Dati originali HTML, rumore come intervallo. Punti discordanti con sezione×velocità conservati e non selezionabili.",
    variants,
    sourceMetadata: {
      manufacturer: "Ecoclima",
      sourceUrl: original.sourceUrl,
      sourceType: "html",
      documentRevision: null,
      retrievedAt: null,
      importedAt: now,
      sha256: original.sha256,
      page: null,
    },
  });
  const eadd = htmlData.EADD,
    eaddVariants: AirTerminalVariant[] = eadd.tables[0].slice(1).map((row) => {
      const nominal = Number(row[0].split("-")[1]),
        [A, B, C, F] = row.slice(1).map((n) => Number(n.replace(",", ".")));
      const flowRow = eadd.tables[1].find(
        (line) => line[0] === `EADD-${nominal}`,
      );
      const range = flowRow?.[1]?.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!range)
        throw new Error(`EADD-${nominal}: published airflow range missing`);
      return {
        id: `ecoclima-eadd-${nominal}`,
        widthMm: null,
        heightMm: null,
        depthMm: null,
        lengthMm: null,
        slotWidthMm: null,
        slotCount: null,
        commercialLengthsMm: [],
        effectiveAreaM2: null,
        nominalDiameterMm: nominal,
        originalDimensionsMm: { A, B, C, F },
        publishedAirflowRangeM3h: [Number(range[1]), Number(range[2])],
        operatingPoints: [],
      };
    });
  if (eaddVariants.length !== 5)
    throw new Error("EADD dimensional table changed");
  catalog.families.push({
    manufacturer: "Ecoclima",
    familyCode: "EADD",
    name: "Diffusore a quattro lati in ABS",
    description:
      "Diffusore bianco con attacco circolare e deflettori mobili sui quattro lati.",
    type: "diffuser",
    mountingType: "Parete o soffitto",
    use: ["supply"],
    isLinearPerMeter: false,
    image: null,
    operatingConditions:
      "Dimensioni originali pubblicate. Portata e rumorosità non disponibili nello snapshot: nessuna selezione automatica.",
    variants: eaddVariants,
    sourceMetadata: {
      manufacturer: "Ecoclima",
      sourceUrl: eadd.sourceUrl,
      sourceType: "html",
      documentRevision: null,
      retrievedAt: null,
      importedAt: now,
      sha256: eadd.sha256,
      page: null,
    },
  });
}
// Supplemental normalizers consume archived primary HTML/PDF sources only.
// Their absence is an import error: never silently replace the complete snapshot.
for (const filename of [
  "normalized-grilles.json",
  "normalized-diffusers.json",
  "normalized-vmc.json",
]) {
  const supplemental = JSON.parse(
    await readFile(path.join(dir, filename), "utf8"),
  ) as { families: AirTerminalFamily[] };
  for (const candidate of supplemental.families) {
    if (
      catalog.families.some(
        (family) => family.familyCode === candidate.familyCode,
      )
    )
      throw new Error(
        `Supplemental family duplicates legacy ID: ${candidate.familyCode}`,
      );
    catalog.families.push(candidate);
  }
}
catalog.families[0].modelCodes = ["EDLS", "EDLSB"];
catalog.families[0].finishes = ["RAL9005", "RAL9016"];
airTerminalCatalogSchema.parse(catalog);
// Apply a reviewed geometry correction without reacquiring or retimestamping curves.
if (process.argv.includes("--geometry-only")) {
  const current = airTerminalCatalogSchema.parse(
    JSON.parse(
      await readFile(
        path.join(root, "catalog-data/generated/ecoclima.json"),
        "utf8",
      ),
    ),
  );
  catalog.families = current.families;
}
const geometrySpecs = JSON.parse(
  await readFile(
    path.join(root, "catalog-data/curation/ecoclima-geometry.json"),
    "utf8",
  ),
) as Record<
  string,
  {
    sourceSha256: string;
    mountings: ("wall" | "ceiling")[];
    shape: "rectangle" | "circle";
    faceWidthAdditionMm?: number;
    faceHeightAdditionMm?: number;
    bodyDepthMm: number | null;
    note: string;
    variantsByNominalDiameterMm?: Record<string, Partial<AirTerminalVariant>>;
  }
>;
for (const family of catalog.families) {
  const geometry = geometrySpecs[family.familyCode];
  if (!geometry) continue;
  if (geometry.sourceSha256 !== family.sourceMetadata.sha256)
    throw new Error(
      `Geometry revision changed for ${family.familyCode}. Reverify drawings before import.`,
    );
  family.mountings = geometry.mountings;
  family.shape = geometry.shape;
  family.geometryNote = geometry.note;
  for (const variant of family.variants) {
    if (geometry.variantsByNominalDiameterMm) {
      const exact =
        geometry.variantsByNominalDiameterMm[String(variant.nominalDiameterMm)];
      if (!exact) throw new Error(`Reviewed geometry missing: ${variant.id}`);
      if (exact.dimensionDrawing) {
        const local = path.join(
          root,
          "public",
          exact.dimensionDrawing.localPath,
        );
        if (
          createHash("sha256")
            .update(await readFile(local))
            .digest("hex") !== exact.dimensionDrawing.sha256
        )
          throw new Error(`Original geometry drawing changed: ${variant.id}`);
      }
      Object.assign(variant, exact);
      continue;
    }
    variant.bodyDepthMm = geometry.bodyDepthMm;
    if (family.isLinearPerMeter) {
      variant.faceWidthMm = null;
      variant.faceHeightMm =
        40 + (variant.slotCount ?? 0) * (variant.slotWidthMm === 30 ? 50 : 40);
    } else {
      variant.faceWidthMm =
        (variant.widthMm ?? 0) + (geometry.faceWidthAdditionMm ?? 0);
      variant.faceHeightMm =
        family.shape === "circle"
          ? variant.faceWidthMm
          : (variant.heightMm ?? 0) + (geometry.faceHeightAdditionMm ?? 0);
    }
  }
}
const imageSources = JSON.parse(
  await readFile(path.join(root, "public/catalog/image-sources.json"), "utf8"),
) as Record<string, { path: string }>;
for (const family of catalog.families)
  family.image = imageSources[family.familyCode]?.path ?? family.image;
catalog.version = `${now.slice(0, 10)}-ecoclima-${createHash("sha256")
  .update(
    JSON.stringify(
      catalog.families.map((f) => ({
        ...f,
        sourceMetadata: {
          sourceUrl: f.sourceMetadata.sourceUrl,
          sha256: f.sourceMetadata.sha256,
          documentRevision: f.sourceMetadata.documentRevision,
        },
      })),
    ),
  )
  .digest("hex")
  .slice(0, 12)}`;
const output = path.join(root, "catalog-data/generated");
await mkdir(output, { recursive: true });
const target = path.join(output, "ecoclima.json"),
  staging = path.join(output, "ecoclima.staging.json");
await writeFile(staging, JSON.stringify(catalog, null, 2));
const oldCatalog = existsSync(target)
  ? airTerminalCatalogSchema.parse(JSON.parse(await readFile(target, "utf8")))
  : null;
const oldVariants = new Map(
  oldCatalog?.families.flatMap((family) =>
    family.variants.map((v) => [v.id, v] as const),
  ) ?? [],
);
const newVariants = airTerminalCatalogSchema
  .parse(catalog)
  .families.flatMap((family) => family.variants);
const diff = {
  added: newVariants.filter((v) => !oldVariants.has(v.id)).map((v) => v.id),
  changed: newVariants
    .filter(
      (v) =>
        oldVariants.has(v.id) &&
        JSON.stringify(oldVariants.get(v.id)) !== JSON.stringify(v),
    )
    .map((v) => v.id),
  removed: [...oldVariants.keys()].filter(
    (id) => !newVariants.some((v) => v.id === id),
  ),
};
await writeFile(
  path.join(output, "ecoclima.report.json"),
  JSON.stringify(diff, null, 2),
);
console.log(
  JSON.stringify({
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removed.length,
    report: "catalog-data/generated/ecoclima.report.json",
  }),
);
console.log(
  JSON.stringify({
    importedFamilies: catalog.families.length,
    importedVariants: catalog.families.flatMap((f) => f.variants).length,
    operatingPoints: catalog.families.flatMap((f) =>
      f.variants.flatMap((v) => v.operatingPoints),
    ).length,
    quarantinedPoints: catalog.families
      .flatMap((f) => f.variants.flatMap((v) => v.operatingPoints))
      .filter((p) => p.quality === "review").length,
    warnings: [
      "EGS/ETA/EADD/EVVMC axial depth not available; explicit null",
      "EADD published flow range preserved; acoustic operating points unavailable, excluded from automatic selection",
    ],
    errors: 0,
  }),
);
if (process.argv.includes("--apply")) {
  const historyPath = path.join(output, "ecoclima-history.json");
  const history = existsSync(historyPath)
    ? JSON.parse(await readFile(historyPath, "utf8"))
    : {};
  if (existsSync(target)) {
    const previous = airTerminalCatalogSchema.parse(
      JSON.parse(await readFile(target, "utf8")),
    );
    history[previous.version] = previous;
    const oldIds = previous.families.flatMap((f) =>
        f.variants.map((v) => v.id),
      ),
      newIds = new Set(
        catalog.families.flatMap((f) => f.variants.map((v) => v.id)),
      );
    const removed = oldIds.filter((id) => !newIds.has(id));
    console.log(JSON.stringify({ removed }));
    if (removed.length && !process.argv.includes("--allow-removal"))
      throw new Error("Removed variants detected. Review before applying.");
    await copyFile(target, path.join(output, "ecoclima.previous.json"));
  }
  history[catalog.version] = catalog;
  await writeFile(historyPath, JSON.stringify(history, null, 2));
  await copyFile(staging, target);
  console.log("Applied official Ecoclima snapshot.");
} else console.log("Staged only. Review, then use --apply.");
