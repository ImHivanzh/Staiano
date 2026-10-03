import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { nativeDwgRuntime } from "./dwg-native";
import { convertDwgDetailed, dwgConverterStatus } from "./dwg-server";
import { parseDxf } from "./dxf";
import {
  calibrationScale,
  preparePlanImport,
  applyPlanImport,
} from "@/domain/geometry/import-plan";
import { createProject } from "@/domain/project";
import { decodeProject, encodeProject } from "@/services/project/format";

const hasNativeRuntime = Boolean(await nativeDwgRuntime());
it.skipIf(!hasNativeRuntime)(
  "actual DWG parser preserves real lines, layers, units and project round-trip without ODA",
  async () => {
    const source = await readFile("tests/fixtures/rectangular.dwg");
    const status = await dwgConverterStatus();
    expect(status.engine).toBe("acadsharp");
    expect(status.license).toBe("MIT");
    const result = await convertDwgDetailed(source);
    expect(result.originalVersion).toBe("AC1032");
    const parsed = parseDxf(result.dxf, "converted.dxf", source.byteLength);
    expect(
      parsed.segments.filter((line) => line.layer === "MURI"),
    ).toHaveLength(4);
    expect(parsed.suggestedMetersPerUnit).toBe(1);
    const plan = preparePlanImport(
      { ...parsed, sourceType: "dwg", filename: "rectangular.dwg" },
      {
        selectedLayers: ["MURI"],
        excludedIds: [],
        metersPerUnit: 1,
        thicknessM: 0.1,
        convertGeometry: true,
        origin: { x: 0, y: 0 },
      },
    );
    const p = createProject();
    const applied = applyPlanImport(p, p.floors[0].id, plan);
    expect(applied.rooms).toHaveLength(1);
    expect(applied.rooms[0].netAreaM2).toBeCloseTo(15.96);
    const restored = decodeProject(encodeProject(applied));
    expect(restored.sourceFilesMetadata[0].sourceType).toBe("dwg");
    expect(restored.rooms[0].netAreaM2).toBeCloseTo(15.96);
    expect(calibrationScale({ x: 0, y: 0 }, { x: 4.3, y: 0 }, 4.3)).toBe(1);
  },
  30000,
);
