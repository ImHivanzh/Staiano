import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
const { buildCatalogHistory, historyFiles } = createRequire(import.meta.url)(
  "../../scripts/build-catalog-history.mjs",
) as {
  historyFiles: Record<string, string>;
  buildCatalogHistory(
    root: string,
  ): Promise<{
    catalogs: Record<string, Record<string, { file: string; sha256: string }>>;
  }>;
};

it("builds immutable per-revision assets without changing the canonical archives", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "staiano-history-assets-"));
  const generated = path.join(root, "catalog-data/generated");
  try {
    await mkdir(generated, { recursive: true });
    for (const file of Object.values(historyFiles))
      await writeFile(path.join(generated, file), "{}");
    const archive = {
      old: { version: "old", value: 1 },
      older: { version: "older", value: 2 },
    };
    const original = JSON.stringify(archive, null, 2);
    const source = path.join(generated, historyFiles.hvac);
    await writeFile(source, original);
    const index = await buildCatalogHistory(root);
    expect(Object.keys(index.catalogs.hvac)).toEqual(["old", "older"]);
    for (const [version, asset] of Object.entries(index.catalogs.hvac)) {
      const content = await readFile(
        path.join(root, "public/catalog-history", asset.file),
      );
      expect(createHash("sha256").update(content).digest("hex")).toBe(
        asset.sha256,
      );
      expect(JSON.parse(content.toString())).toEqual(
        archive[version as keyof typeof archive],
      );
    }
    expect(await readFile(source, "utf8")).toBe(original);
    expect((await buildCatalogHistory(root)).catalogs).toEqual(index.catalogs);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
