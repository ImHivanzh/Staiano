import { mkdir, writeFile } from "node:fs/promises";
import { largeProjectFixture } from "../../tests/large-project";
import { encodeProject } from "../../src/services/project/format";
await mkdir("tests/fixtures", { recursive: true });
await writeFile(
  "tests/fixtures/large.hvacproj",
  encodeProject(largeProjectFixture()),
);
console.log("Generated real catalog-backed large-house fixture");
