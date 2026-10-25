import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const files = process.argv.slice(2);
assert(files.length > 0, "Indicare uno o più bundle worker da misurare.");
// Each bundle runs in a fresh process so maxRSS and cold-start remain comparable.
const probe = `
  const { readFileSync, statSync } = require('node:fs');
  const { runInThisContext } = require('node:vm');
  const started = performance.now();
  const buffer = new TextEncoder().encode(readFileSync('tests/fixtures/realistic-home.hvacproj', 'utf8')).buffer;
  globalThis.self = { postMessage(result) {
    if (result.error) throw new Error(result.error);
    if (!result.project?.id) throw new Error('Progetto non decodificato');
    console.log(JSON.stringify({ file: process.argv[1], bytes: statSync(process.argv[1]).size,
      coldStartMs: performance.now() - started, heapUsedBytes: process.memoryUsage().heapUsed,
      peakRssBytes: process.resourceUsage().maxRSS * 1024, projectId: result.project.id }));
  }};
  runInThisContext(readFileSync(process.argv[1], 'utf8'));
  self.onmessage({ data: { buffer } });
`;
let projectId;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--eval", probe, file], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const measurement = JSON.parse(result.stdout);
  projectId ??= measurement.projectId;
  assert.equal(measurement.projectId, projectId);
  console.log(JSON.stringify(measurement));
}
