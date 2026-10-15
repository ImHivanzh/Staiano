import { describe, expect, it } from "vitest";
import { addRectangle, createProject, moveWall, updateRoom } from "./project";
import {
  encodeProject,
  decodeProject,
  parseProject,
} from "@/services/project/format";
import { projectSchema } from "@/schemas/project";
import { validateProject } from "./validation";
import { buildDossier } from "@/services/pdf/dossier";
import { renderDossierPdf } from "@/services/pdf/render";
import { applyFanCoil } from "./fan-coils/apply";
import { applyManualDuctedSystem, ductedRoomAllocation } from "./ducted/apply";
import { convertLength } from "@/configurator/LengthInput";
import { guidedProjectFixture } from "../../tests/guided-fixture";

function fixture() {
  const project = createProject("Prova impostazioni");
  return addRectangle(project, project.floors[0].id, {
    width: 5,
    length: 4,
    height: 2.7,
    name: "Ripostiglio",
  });
}

describe("explicit unconditioned rooms", () => {
  it("preserves geometry, volume and reason through edits and reopening; restoring conditioning recalculates the load", () => {
    const before = fixture();
    const room = before.rooms[0];
    let project = updateRoom(before, room.id, {
      conditioningExclusion: { reason: "Locale non riscaldato" },
    });
    expect(project.rooms[0].designLoadW).toBe(0);
    expect(project.rooms[0].volumeM3).toBe(room.volumeM3);
    expect(project.rooms[0].polygon).toEqual(room.polygon);
    expect(
      validateProject(project).filter((check) => check.status !== "valid"),
    ).toEqual([]);
    project = moveWall(project, project.walls[0].id, { x: 0, y: -0.1 });
    project = decodeProject(encodeProject(project));
    expect(project.rooms[0].conditioningExclusion?.reason).toBe(
      "Locale non riscaldato",
    );
    expect(project.rooms[0].designLoadW).toBe(0);
    expect(buildDossier(project).totals.loadW).toBe(0);
    const restored = updateRoom(project, room.id, {
      conditioningExclusion: undefined,
    });
    expect(restored.rooms[0].designLoadW).toBeCloseTo(
      restored.rooms[0].netAreaM2 * 2.7 * 35,
    );
    expect(() =>
      projectSchema.parse(
        updateRoom(before, room.id, {
          conditioningExclusion: { reason: "  " },
        }),
      ),
    ).toThrow();
  });

  it("keeps installed equipment and warns about inconsistent associations, without accepting new equipment", () => {
    const before = fixture();
    let project = applyFanCoil(before, before.rooms[0].id, "aermec-fcz100", 1);
    const installed = structuredClone(project.fanCoils);
    project = updateRoom(project, project.rooms[0].id, {
      conditioningExclusion: { reason: "Non previsto" },
    });
    expect(project.fanCoils).toEqual(installed);
    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        code: "excludedRoomEquipment",
        status: "warning",
      }),
    );
    expect(() =>
      applyFanCoil(project, project.rooms[0].id, "aermec-fcz100", 1),
    ).toThrow();
  });

  it("excludes the room from ducted allocations while retaining the saved machine", () => {
    const before = guidedProjectFixture();
    const project = updateRoom(before, before.rooms[0].id, {
      conditioningExclusion: { reason: "Escluso dalla proposta" },
    });
    expect(ductedRoomAllocation(project, project.rooms[0].id)).toBeNull();
    expect(project.hvacSystems).toEqual(before.hvacSystems);
    const reopened = decodeProject(encodeProject(project));
    expect(reopened.hvacSystems[0].id).toBe(before.hvacSystems[0].id);
    expect(reopened.rooms[0].designLoadW).toBe(0);
    expect(validateProject(project)).toContainEqual(
      expect.objectContaining({
        code: "excludedRoomEquipment",
        status: "warning",
      }),
    );
    expect(() =>
      applyManualDuctedSystem(project, [project.rooms[0].id], {
        manufacturer: "Manuale",
        model: "Prova",
        maxAirflowM3h: 300,
      }),
    ).toThrow();
  });

  it("puts the exclusion reason in both complete and summary PDF output", async () => {
    const before = fixture();
    const project = updateRoom(before, before.rooms[0].id, {
      conditioningExclusion: { reason: "Ripostiglio senza riscaldamento" },
    });
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    for (const variant of ["complete", "summary"] as const) {
      const task = pdfjs.getDocument({
        data: await renderDossierPdf(project, { variant }),
      });
      const document = await task.promise;
      try {
        let text = "";
        for (let index = 1; index <= document.numPages; index++) {
          const content = await (
            await document.getPage(index)
          ).getTextContent();
          text += content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
        }
        expect(text).toContain("Ripostiglio senza riscaldamento");
        expect(text.toLowerCase()).toContain("non climatizzato");
      } finally {
        await task.destroy();
      }
    }
  });
});

it("converts length units without rounding project measurements", () => {
  expect(convertLength(4200, "mm", "m")).toBeCloseTo(4.2, 12);
  expect(convertLength(2.75, "m", "cm")).toBe(275);
  expect(convertLength(275, "cm", "mm")).toBe(2750);
  expect(
    convertLength(convertLength(0.1234567, "m", "mm"), "mm", "m"),
  ).toBeCloseTo(0.1234567, 12);
});

it("migrates v3 without data loss, remains idempotent and marks new files as v5", () => {
  const project = fixture();
  const legacy = { ...structuredClone(project), schemaVersion: 3 };
  const migrated = parseProject(legacy);
  expect(migrated.schemaVersion).toBe(6);
  expect({ ...migrated, schemaVersion: 3 }).toEqual(legacy);
  expect(parseProject(migrated)).toEqual(migrated);
  const excluded = updateRoom(migrated, migrated.rooms[0].id, {
    conditioningExclusion: { reason: "Non riscaldato" },
  });
  const file = JSON.parse(encodeProject(excluded));
  expect(file.schemaVersion).toBe(6);
  expect(file.rooms[0].conditioningExclusion.reason).toBe("Non riscaldato");
});
