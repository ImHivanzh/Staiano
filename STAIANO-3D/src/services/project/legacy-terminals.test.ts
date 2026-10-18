import { describe, expect, it } from "vitest";
import { addRectangle, createProject } from "@/domain/project";
import {
  decodeProject,
  encodeProject,
  migrateProject,
  parseProject,
} from "./format";
import {
  legacyTerminalCheck,
  needsTerminalReconfiguration,
} from "@/domain/air-terminals/legacy";
import { movePlacedDevice } from "@/domain/geometry/move-device";

function legacyFixture(count = 1) {
  const project = createProject("Archivio legacy");
  const p = addRectangle(project, project.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Stanza",
  });
  return {
    ...p,
    schemaVersion: 1,
    airTerminals: Array.from({ length: count }, (_, i) => ({
      id: `legacy-${i}`,
      roomId: p.rooms[0].id,
      floorId: p.floors[0].id,
      wallId: null,
      position: { ...p.rooms[0].centroid },
      rotation: 0.125,
      widthMm: 1000,
      heightMm: 100,
      depthMm: 60,
      productId: "saved-product",
      catalogVersion: "saved-catalog",
      use: "supply",
      requiredAirflowM3h: 120,
      availableAirflowM3h: 150,
      noiseDbA: 25,
      theoreticalLengthM: 0.8,
      family: "EDLS",
    })),
  };
}

describe("terminali legacy", () => {
  it("migra 150 terminali senza inventare montaggio, quota, forma o indice di catalogo", () => {
    const old = legacyFixture(150);
    const before = JSON.stringify(old);
    const p = parseProject(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(p.airTerminals).toHaveLength(150);
    for (const t of p.airTerminals) {
      expect(t.mounting).toBe("unknown");
      expect(t.shape).toBe("unknown");
      expect(t.elevationM).toBeNull();
      expect(t.operatingPointIndex).toBeNull();
      expect(t.pointIndex).toBeNull();
      expect(t.unitIndex).toBeNull();
      expect(t.legacyUnverified).toBe(true);
      expect(legacyTerminalCheck(t)?.status).toBe("warning");
    }
  });
  it("mantiene quote, portate, rumore, posizione e provenienza durante export/reload", () => {
    const old = legacyFixture();
    const p = decodeProject(encodeProject(parseProject(old)));
    const t = p.airTerminals[0];
    expect(t).toMatchObject(old.airTerminals[0]);
    expect(needsTerminalReconfiguration(t)).toBe(true);
    expect(t.elevationM).toBeNull();
    expect(() => movePlacedDevice(p, t.id, { x: 2, y: 1 })).toThrow(
      /riconfigurare/,
    );
  });
  it("conserva anche metadati di installazione presenti ma non li certifica automaticamente", () => {
    const old = legacyFixture();
    const source = {
      ...old,
      airTerminals: [
        {
          ...old.airTerminals[0],
          mounting: "ceiling",
          shape: "rectangle",
          elevationM: 2.4,
          operatingPointIndex: 4,
          pointIndex: 1,
          unitIndex: 2,
        },
      ],
    };
    const migrated = migrateProject(source) as {
      airTerminals: Record<string, unknown>[];
    };
    expect(migrated.airTerminals[0]).toMatchObject({
      mounting: "ceiling",
      shape: "rectangle",
      elevationM: 2.4,
      operatingPointIndex: 4,
      pointIndex: 1,
      unitIndex: 2,
      legacyUnverified: true,
    });
    const p = parseProject(source);
    expect(p.airTerminals[0].elevationM).toBe(2.4);
    expect(needsTerminalReconfiguration(p.airTerminals[0])).toBe(true);
  });
});
