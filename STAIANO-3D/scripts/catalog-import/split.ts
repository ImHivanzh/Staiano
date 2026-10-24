import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { splitCatalogSchema } from "../../src/domain/catalogs/split-schema";
const names = ["daikin", "mitsubishi", "gree", "series-extra"];
const inputs = names
  .filter((name) => existsSync(`catalog-data/curation/split-${name}.json`))
  .map((name) =>
    JSON.parse(
      readFileSync(`catalog-data/curation/split-${name}.json`, "utf8"),
    ),
  );
const metadata = (source: Record<string, unknown>, manufacturer: string) => ({
  ...source,
  manufacturer,
  documentRevision: source.documentRevision ?? source.revision ?? null,
});
const data = {
  outdoorUnits: inputs
    .flatMap((v) => v.outdoorUnits ?? [])
    .map((v) => ({
      ...v,
      sourceMetadata: metadata(v.sourceMetadata, v.manufacturer),
    })),
  indoorUnits: inputs
    .flatMap((v) => v.indoorUnits)
    .map((v) => ({
      ...v,
      sizeClass: String(v.sizeClass),
      sourceMetadata: metadata(v.sourceMetadata, v.manufacturer),
    })),
  combinations: inputs
    .flatMap((v) => v.combinations)
    .map((v) => ({
      ...v,
      notes: Array.isArray(v.notes) ? v.notes.join(" ") : v.notes,
      sourceMetadata: metadata(v.sourceMetadata, v.manufacturer),
      secondarySourceMetadata: (v.secondarySourceMetadata ?? []).map(
        (s: Record<string, unknown>) => metadata(s, v.manufacturer),
      ),
    })),
};
const technical = JSON.stringify(data, (key, value) =>
  ["retrievedAt", "importedAt"].includes(key) ? undefined : value,
);
const version = `split-${createHash("sha256").update(technical).digest("hex").slice(0, 16)}`;
const parsed = splitCatalogSchema.safeParse({ version, ...data });
if (!parsed.success) {
  console.error(
    "Catalogo split rifiutato:",
    parsed.error.issues.length,
    "errori",
    JSON.stringify(parsed.error.issues.slice(0, 5)),
  );
  process.exit(1);
}
const catalog = parsed.data;
const file = "catalog-data/generated/splits.json",
  historyFile = "catalog-data/generated/splits-history.json";
const previous = existsSync(file)
  ? splitCatalogSchema.parse(JSON.parse(readFileSync(file, "utf8")))
  : null;
const oldIds = new Set(previous?.combinations.map((v) => v.id)),
  newIds = new Set(catalog.combinations.map((v) => v.id));
const removed = [...oldIds].filter((id) => !newIds.has(id));
const outdoorKeys = new Set(
  catalog.outdoorUnits.map((unit) => `${unit.manufacturer}:${unit.model}`),
);
const removedOutdoors = (previous?.outdoorUnits ?? []).filter(
  (unit) => !outdoorKeys.has(`${unit.manufacturer}:${unit.model}`),
);
console.log(
  JSON.stringify(
    {
      version,
      indoorUnits: catalog.indoorUnits.length,
      combinations: catalog.combinations.length,
      outdoorUnits: catalog.outdoorUnits.length,
      added: [...newIds].filter((id) => !oldIds.has(id)).length,
      removed,
      removedOutdoors: removedOutdoors.map((unit) => unit.model),
    },
    null,
    2,
  ),
);
if (
  (removed.length || removedOutdoors.length) &&
  !process.argv.includes("--allow-removals")
)
  throw new Error(
    "Rimozioni catalogo: verificare report e ripetere con --allow-removals solo dopo revisione.",
  );
if (!process.argv.includes("--apply")) {
  console.log("Validato. Usare --apply per salvare snapshot e storico.");
  process.exit(0);
}
const history = existsSync(historyFile)
  ? JSON.parse(readFileSync(historyFile, "utf8"))
  : {};
if (previous) history[previous.version] = previous;
delete history[version];
writeFileSync(historyFile, JSON.stringify(history, null, 2) + "\n");
writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
