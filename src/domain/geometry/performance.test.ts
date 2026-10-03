import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createProject,
  newId,
  recomputeProject,
  moveWall,
} from "@/domain/project";
import type { Project, Wall } from "@/schemas/project";
import { projectSchema } from "@/schemas/project";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { sizeRadiators } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
import { validateProject } from "@/domain/validation";
import { encodeProject, decodeProject } from "@/services/project/format";
import { IndexedDbProjectRepository } from "@/services/project/repository";

/** 50 independent rooms, 200 real walls and 100 catalog-backed radiators. */
function largeHouse(): Project {
  let project = createProject("Benchmark 50 ambienti");
  const floorId = project.floors[0].id;
  const walls: Wall[] = [];
  for (let index = 0; index < 50; index++) {
    const x = (index % 10) * 7,
      y = Math.floor(index / 10) * 6;
    const points = [
      { x, y },
      { x: x + 5.3, y },
      { x: x + 5.3, y: y + 4.3 },
      { x, y: y + 4.3 },
    ];
    points.forEach((start, i) =>
      walls.push({
        id: newId(),
        floorId,
        start,
        end: points[(i + 1) % 4],
        thickness: 0.3,
        type: "ESTERNO",
        height: null,
      }),
    );
  }
  project = recomputeProject({ ...project, walls });
  project.rooms.forEach((room, index) => {
    room.name = `Ambiente ${index + 1}`;
  });
  const product = radiatorProducts.find(
    (item) => item.manufacturer === "Global" && item.family === "VIP",
  )!;
  const solution = sizeRadiators(
    Math.max(...project.rooms.map((room) => room.designLoadW)) + 1e-6,
    radiatorProducts,
    50,
    {
      manufacturer: product.manufacturer,
      family: product.family,
      numberOfRadiators: 2,
      maxHeightMm: 800,
      maxWidthMm: 1000,
      minElements: 5,
      maxElements: 15,
    },
  )[0];
  if (!solution)
    throw new Error(
      "La fixture richiede una soluzione commerciale a due radiatori.",
    );
  for (const room of project.rooms)
    project = applyRadiatorSolution(project, room.id, solution, null);
  return projectSchema.parse(project);
}
function measured<T>(run: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = run();
  return { value, ms: performance.now() - started };
}
const median = (samples: number[]) =>
  [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];

describe("prestazioni: 200 muri, 50 stanze, 100 apparecchi reali", () => {
  it("ricalcola, verifica, serializza e salva senza perdere identità o prestazioni", async () => {
    const project = largeHouse();
    expect(project.walls).toHaveLength(200);
    expect(project.rooms).toHaveLength(50);
    expect(project.radiators).toHaveLength(100);
    const wallIds = project.walls.map((item) => item.id);
    const deviceIds = project.radiators.map((item) => item.id);
    const recomputeSamples: number[] = [],
      validationSamples: number[] = [];
    for (let sample = 0; sample < 5; sample++) {
      const rebuilt = measured(() => recomputeProject(project));
      recomputeSamples.push(rebuilt.ms);
      expect(rebuilt.value.walls.map((item) => item.id)).toEqual(wallIds);
      expect(rebuilt.value.radiators.map((item) => item.id)).toEqual(deviceIds);
      const checked = measured(() => validateProject(rebuilt.value));
      validationSamples.push(checked.ms);
      expect(
        checked.value.filter((check) => check.status === "invalid"),
      ).toEqual([]);
    }
    const encoded = measured(() => encodeProject(project));
    const decoded = measured(() => decodeProject(encoded.value));
    expect(decoded.value.rooms).toHaveLength(50);
    expect(decoded.value.radiators.map((item) => item.id)).toEqual(deviceIds);
    const move = measured(() =>
      moveWall(project, wallIds[0], { x: 0, y: -0.1 }),
    );
    expect(move.value.rooms).toHaveLength(50);
    expect(move.value.radiators).toHaveLength(100);
    const repository = new IndexedDbProjectRepository(
      `performance-${crypto.randomUUID()}`,
    );
    const saveStarted = performance.now();
    await repository.save(project);
    const saveMs = performance.now() - saveStarted;
    const loadStarted = performance.now();
    const restored = await repository.get(project.id);
    const loadMs = performance.now() - loadStarted;
    expect(restored?.radiators.map((item) => item.id)).toEqual(deviceIds);
    expect(restored?.rooms.map((room) => room.designLoadW)).toEqual(
      project.rooms.map((room) => room.designLoadW),
    );
    const metrics = {
      walls: 200,
      rooms: 50,
      devices: 100,
      recomputeMedianMs: median(recomputeSamples),
      recomputeWorstMs: Math.max(...recomputeSamples),
      validationMedianMs: median(validationSamples),
      validationWorstMs: Math.max(...validationSamples),
      moveMs: move.ms,
      encodeMs: encoded.ms,
      decodeMs: decoded.ms,
      saveMs,
      loadMs,
      projectBytes: new TextEncoder().encode(encoded.value).byteLength,
    };
    console.info(`HVAC_PERFORMANCE ${JSON.stringify(metrics)}`);
    // Regression budgets deliberately tolerate shared CI load. They do not certify browser frame rate.
    expect(metrics.recomputeMedianMs).toBeLessThan(1000);
    expect(metrics.validationMedianMs).toBeLessThan(500);
    expect(move.ms).toBeLessThan(2000);
    for (const elapsed of [encoded.ms, decoded.ms, saveMs, loadMs])
      expect(elapsed).toBeLessThan(2000);
    await repository.delete(project.id);
  }, 20000);
});
