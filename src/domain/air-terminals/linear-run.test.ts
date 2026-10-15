import { describe, expect, it } from "vitest";
import {
  guidedProjectFixture,
  guidedTerminalPoint,
} from "../../../tests/guided-fixture";
import { projectSchema, type Project } from "@/schemas/project";
import {
  addOperatorTerminal,
  editOperatorTerminal,
  type OperatorTerminalInput,
} from "./operator";
import {
  calculateEcoclimaBom,
  continuityModuleLengths,
} from "./commercial-bom";
import { airTerminalCatalog } from "../catalogs/air-terminals";
import { terminalAirflowBalance } from "./airflow-balance";
import { systemLinearBalances } from "./linear-meters";
import { movePlacedDevice } from "../geometry/move-device";
import {
  duplicateSelection,
  removeSelection,
  translateSelection,
} from "../geometry/selection";

function input(
  project: Project,
  modules?: number[],
  mounting: "ceiling" | "wall" = "ceiling",
): OperatorTerminalInput {
  return {
    ...guidedTerminalPoint(mounting === "wall" ? "EDLH" : "EDLS"),
    roomId: project.rooms[0].id,
    systemId: project.hvacSystems[0].id,
    use: "supply",
    mounting,
    lengthMm: modules?.reduce((sum, value) => sum + value, 0) ?? 1000,
    moduleLengthsMm: modules,
    finish: "RAL9016",
  };
}
function kits(project: Project) {
  return calculateEcoclimaBom(project).lines.filter(
    (line) => line.kind === "continuity-kit",
  );
}

describe("composable terminal points", () => {
  it.each(["EDFL-20", "EDFLB-20", "EDFLNA-20", "EDFLBNA-20"])(
    "offers and joins official modules for %s",
    (familyCode) => {
      const project = guidedProjectFixture(3);
      const point = guidedTerminalPoint(familyCode);
      const variant = airTerminalCatalog.families
        .find((family) => family.familyCode === familyCode)!
        .variants.find((item) => item.id === point.variantId)!;
      expect(continuityModuleLengths(familyCode, variant)).toEqual(
        expect.arrayContaining([1000, 2000]),
      );
      const joined = addOperatorTerminal(project, {
        ...input(project, [2000, 1000]),
        ...point,
      });
      expect(kits(joined)[0].quantity).toBe(1);
    },
  );
  it("covers three meters with separate 1 m and 2 m points, without continuity kits", () => {
    const original = guidedProjectFixture(3);
    let project = addOperatorTerminal(original, input(original));
    project = addOperatorTerminal(project, {
      ...input(project),
      lengthMm: 2000,
    });
    expect(project.airTerminals.map((t) => t.widthMm)).toEqual([1000, 2000]);
    expect(
      systemLinearBalances(project, project.hvacSystems[0].id)[0],
    ).toMatchObject({ installedM: 3, status: "ok" });
    expect(kits(project)).toEqual([]);
    expect(original.airTerminals).toEqual([]);
  });

  it.each([
    [2000, 1000],
    [1000, 1000, 1000],
  ])(
    "persists joined modules %j with one kit per joint and exact total capacity",
    (...lengths) => {
      const original = guidedProjectFixture(3);
      const project = projectSchema.parse(
        JSON.parse(
          JSON.stringify(
            addOperatorTerminal(original, input(original, lengths)),
          ),
        ),
      );
      expect(project.airTerminals.map((t) => t.widthMm)).toEqual(lengths);
      expect(new Set(project.airTerminals.map((t) => t.id)).size).toBe(
        lengths.length,
      );
      expect(
        new Set(
          project.airTerminals.map((t) => t.commercialOptions?.linearRunId),
        ).size,
      ).toBe(1);
      expect(kits(project)).toEqual([
        expect.objectContaining({ quantity: lengths.length - 1 }),
      ]);
      expect(
        terminalAirflowBalance(
          project,
          project.hvacSystems[0].id,
          "supply",
          project.rooms[0].id,
        ).remaining,
      ).toBeCloseTo(0);
      expect(
        systemLinearBalances(project, project.hvacSystems[0].id)[0].installedM,
      ).toBeCloseTo(3);
      expect(
        calculateEcoclimaBom(project).lines.filter(
          (line) => line.kind === "insulated-plenum",
        ),
      ).toHaveLength(lengths.length);
      expect(original.airTerminals).toEqual([]);
    },
  );

  it.each(["ceiling", "wall"] as const)(
    "moves the whole %s point from either module and preserves joints",
    (mounting) => {
      const original = guidedProjectFixture(3);
      let project = addOperatorTerminal(
        original,
        input(original, [2000, 1000], mounting),
      );
      for (const index of [0, 1]) {
        const terminal = project.airTerminals[index];
        project = movePlacedDevice(project, terminal.id, {
          x: terminal.position.x + 0.4,
          y: terminal.position.y + (mounting === "ceiling" ? 0.4 : 0),
        });
        expect(kits(project)[0].quantity).toBe(1);
      }
      const selection = project.airTerminals.map((t) => ({
        kind: "device" as const,
        id: t.id,
      }));
      project = translateSelection(project, selection, { x: 0.2, y: 0 });
      expect(kits(project)[0].quantity).toBe(1);
    },
  );

  it("rotates and resizes a composed point while retaining physical joints", () => {
    const original = guidedProjectFixture(3);
    let project = addOperatorTerminal(original, input(original, [2000, 1000]));
    project = editOperatorTerminal(project, project.airTerminals[0].id, {
      rotation: Math.PI / 2,
    });
    expect(project.airTerminals.every((t) => t.rotation === Math.PI / 2)).toBe(
      true,
    );
    expect(kits(project)[0].quantity).toBe(1);
    expect(() =>
      editOperatorTerminal(project, project.airTerminals[0].id, {
        widthMm: 1100,
      }),
    ).toThrow(/compatibili/);
    project = editOperatorTerminal(project, project.airTerminals[1].id, {
      widthMm: 2000,
    });
    expect(kits(project)[0].quantity).toBe(1);
    expect(
      systemLinearBalances(project, project.hvacSystems[0].id)[0].installedM,
    ).toBe(4);
  });

  it("rejects unsupported modules, invalid lengths, locked members and points outside the room", () => {
    const original = guidedProjectFixture(3);
    for (const lengths of [
      [0, 1000],
      [-1000, 2000],
      [NaN, 1000],
      [Infinity, 1000],
      [1000],
      [],
      [1100, 1000],
    ])
      expect(() =>
        addOperatorTerminal(original, input(original, lengths)),
      ).toThrow();
    const project = addOperatorTerminal(
      original,
      input(original, [2000, 1000]),
    );
    expect(() =>
      addOperatorTerminal(original, {
        ...input(original, [2000, 1000]),
        lengthMm: 4000,
      }),
    ).toThrow(/Composizione/);
    expect(() =>
      addOperatorTerminal(original, {
        ...input(original, [2000, 1000]),
        manualDimensions: { widthMm: 1000, heightMm: 60, depthMm: 50 },
      }),
    ).toThrow(/Composizione/);
    expect(() =>
      movePlacedDevice(project, project.airTerminals[0].id, { x: 0.1, y: 0.1 }),
    ).toThrow(/non rientra/);
    project.airTerminals[1].locked = true;
    expect(() =>
      movePlacedDevice(project, project.airTerminals[0].id, { x: 4, y: 3 }),
    ).toThrow(/Sbloccare/);
    expect(() =>
      editOperatorTerminal(project, project.airTerminals[0].id, {
        rotation: 1,
      }),
    ).toThrow(/Sbloccare/);
    expect(original.airTerminals).toEqual([]);
  });

  it("keeps copied runs independent and does not join a separately copied module", () => {
    const original = guidedProjectFixture(3);
    const project = addOperatorTerminal(
      original,
      input(original, [2000, 1000]),
    );
    const selection = project.airTerminals.map((t) => ({
      kind: "device" as const,
      id: t.id,
    }));
    const copied = duplicateSelection(project, selection, { x: 0, y: 1 });
    expect(kits(copied).map((kit) => kit.quantity)).toEqual([1, 1]);
    const single = duplicateSelection(project, [selection[0]], { x: 0, y: 1 });
    expect(kits(single)).toHaveLength(1);
    expect(
      single.airTerminals.at(-1)?.commercialOptions?.linearRunId,
    ).toBeUndefined();
    expect(kits(removeSelection(project, [selection[0]]))).toEqual([]);
  });
});
