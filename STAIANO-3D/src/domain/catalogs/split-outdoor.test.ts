import { expect, it } from "vitest";
import {
  splitCatalog,
  splitCatalogAtVersion,
  splitOutdoorAtVersion,
} from "./splits";
import { splitCatalogSchema } from "./split-schema";
import { createProject, addRectangle } from "@/domain/project";
import {
  applySplitSystem,
  splitSystemFromSolution,
} from "../air-conditioning/apply";
import { sizeSplitSystems } from "../air-conditioning/size";
import {
  hvacOutdoorDimensions,
  withHvacOutdoorUnit,
} from "../air-conditioning/outdoor";
import { refreshSplitBindings } from "../air-conditioning/refresh";
import { validateSplitSystem } from "../air-conditioning/validate";
import { decodeProject, encodeProject } from "@/services/project/format";
import { buildDossier } from "@/services/pdf/dossier";
import { installedTechnicalSheets } from "@/services/export/technical-sheets";

function roomProject() {
  const empty = createProject();
  return addRectangle(empty, empty.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Camera",
  });
}

it("covers every combination with one exact manufacturer/model outdoor record", () => {
  expect(splitCatalog.outdoorUnits).toHaveLength(91);
  for (const combination of splitCatalog.combinations)
    expect(
      splitOutdoorAtVersion(
        combination.outdoorModel,
        combination.manufacturer,
        splitCatalog.version,
      ),
      combination.id,
    ).not.toBeNull();
  expect(
    splitOutdoorAtVersion("RXM25A9", "Gree", splitCatalog.version),
  ).toBeNull();
});

it.each([
  ["Daikin", "RXM25A9", 923, 610, 367],
  ["Daikin", "RXM50A9/8", 954, 734, 401],
  ["Daikin", "2MXM50A8", 852, 552, 350],
  ["Daikin", "RXF50D", 870, 734, 373],
  ["Mitsubishi Electric", "MUZ-AY20VG", 800, 550, 285],
  ["Mitsubishi Electric", "MUZ-EF50VG", 800, 714, 285],
  ["Mitsubishi Electric", "MUZ-HR25VF", 699, 538, 249],
  ["Mitsubishi Electric", "MXZ-6F120VF2", 950, 1048, 330],
  ["Gree", "GWHD(24)NK6OO", 964, 660, 402],
  ["Gree", "GWH24AVEXF-K6DNA1A/O", 958, 660, 402],
] as const)(
  "preserves source L x H x P for %s %s",
  (brand, model, width, height, depth) => {
    const unit = splitOutdoorAtVersion(model, brand, splitCatalog.version)!;
    expect([unit.widthMm, unit.heightMm, unit.depthMm]).toEqual([
      width,
      height,
      depth,
    ]);
    expect(unit.sourceMetadata.page).toBeGreaterThan(0);
    expect(unit.sourceMetadata.sha256).toMatch(/^[a-f0-9]{64}$/);
  },
);

it("rejects duplicate, missing and non-positive claimed measurements", () => {
  expect(
    splitCatalogSchema.safeParse({
      ...splitCatalog,
      outdoorUnits: [
        ...splitCatalog.outdoorUnits,
        splitCatalog.outdoorUnits[0],
      ],
    }).success,
  ).toBe(false);
  expect(
    splitCatalogSchema.safeParse({
      ...splitCatalog,
      outdoorUnits: splitCatalog.outdoorUnits.slice(1),
    }).success,
  ).toBe(false);
  expect(
    splitCatalogSchema.safeParse({
      ...splitCatalog,
      outdoorUnits: splitCatalog.outdoorUnits.map((u, i) =>
        i ? u : { ...u, depthMm: 0 },
      ),
    }).success,
  ).toBe(false);
});

it("uses published measurements for placement and catches altered saved dimensions", () => {
  const room = roomProject();
  const project = applySplitSystem(room, [room.rooms[0].id], "Daikin", null);
  const system = project.hvacSystems[0],
    dimensions = hvacOutdoorDimensions(system)!;
  expect(dimensions.dimensionStatus).toBe("published");
  expect(system.outdoorUnit).toMatchObject({
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm,
    depthMm: dimensions.depthMm,
  });
  expect(withHvacOutdoorUnit(project, system)).toBe(system);
  const changed = {
    ...system,
    outdoorUnit: {
      ...system.outdoorUnit!,
      widthMm: system.outdoorUnit!.widthMm + 1,
    },
  };
  expect(validateSplitSystem(project, changed)).toContainEqual(
    expect.objectContaining({
      code: "split-outdoor-dimensions",
      status: "invalid",
    }),
  );
});

it("preserves historic footprints, poses and review status through reload and refresh", () => {
  const historical = splitCatalogAtVersion("split-5fca5af2b8c15f02")!;
  expect(historical.outdoorUnits).toEqual([]);
  const project = roomProject();
  const solution = sizeSplitSystems(
    project,
    [project.rooms[0].id],
    "Daikin",
    historical,
  )[0];
  const system = splitSystemFromSolution(project, solution, historical, null);
  const original = structuredClone(system.outdoorUnit);
  const loaded = decodeProject(
    encodeProject({ ...project, hvacSystems: [system] }),
  );
  const after = refreshSplitBindings(loaded);
  expect(after.hvacSystems[0].catalogVersion).toBe(historical.version);
  expect(after.hvacSystems[0].outdoorUnit).toEqual(original);
  expect(hvacOutdoorDimensions(after.hvacSystems[0])?.dimensionStatus).toBe(
    "indicative",
  );
  expect(validateSplitSystem(after, after.hvacSystems[0])).toContainEqual(
    expect.objectContaining({
      code: "split-outdoor-dimensions",
      status: "warning",
    }),
  );
  expect(
    buildDossier(after).materials.some((item) =>
      item.details?.includes("ingombro esterno indicativo"),
    ),
  ).toBe(true);
});

it("includes the dimension source in installed technical sheets and dossier", () => {
  const room = roomProject();
  const project = applySplitSystem(room, [room.rooms[0].id], "Daikin", null);
  const source = hvacOutdoorDimensions(project.hvacSystems[0])!.sourceMetadata!;
  expect(
    installedTechnicalSheets(project).documents.some(
      (document) =>
        document.source.sha256 === source.sha256 &&
        document.pages.includes(source.page!),
    ),
  ).toBe(true);
  expect(
    buildDossier(project).sources.some(
      (document) => document.sha256 === source.sha256,
    ),
  ).toBe(true);
  expect(
    buildDossier(project).materials.some((item) =>
      item.dimensions?.includes("Unità esterna L × H × P"),
    ),
  ).toBe(true);
});
