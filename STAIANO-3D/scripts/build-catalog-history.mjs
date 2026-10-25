import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const historyFiles = {
  radiators: "radiator-history.json",
  airTerminals: "ecoclima-history.json",
  hvac: "hvac-history.json",
  fanCoils: "fan-coils-history.json",
  heatPumps: "heat-pumps-history.json",
  splits: "splits-history.json",
  vrv: "vrv-history.json",
};

export async function buildCatalogHistory(root = process.cwd()) {
  const generated = path.join(root, "catalog-data/generated");
  const output = path.join(root, "public/catalog-history");
  await mkdir(output, { recursive: true });
  const catalogs = {};
  for (const [kind, file] of Object.entries(historyFiles)) {
    const archive = JSON.parse(
      await readFile(path.join(generated, file), "utf8"),
    );
    const entries = Object.create(null);
    for (const [version, value] of Object.entries(archive)) {
      const text = JSON.stringify(value);
      const sha256 = createHash("sha256").update(text).digest("hex");
      const name = `${sha256}.json`;
      const target = path.join(output, name);
      if ((await readFile(target, "utf8").catch(() => null)) !== text)
        await writeFile(target, text);
      entries[version] = { file: name, sha256 };
    }
    catalogs[kind] = entries;
  }
  // Keep immutable older assets available to the server still serving the previous build.
  const index = { files: historyFiles, catalogs };
  await writeFile(
    path.join(generated, "catalog-history-index.json"),
    JSON.stringify(index, null, 2) + "\n",
  );
  return index;
}
