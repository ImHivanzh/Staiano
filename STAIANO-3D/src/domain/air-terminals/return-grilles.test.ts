import { expect, it } from "vitest";
import { airTerminalCatalog } from "../catalogs/air-terminals";
import { sizeAirTerminal, acousticUpperBound } from "./size";
import { addOperatorTerminal, editOperatorTerminal } from "./operator";
import { validateProject } from "../validation";
import { refreshDuctedBindings } from "../ducted/refresh";
import { calculateSupplyPlenum } from "../ducted/plenum";
import { threeRoomTerminalFixture } from "../../../tests/guided-fixture";

it("EGA6 return permits noise above 37, preserves chosen dimensions and checks total machine airflow", () => {
  const project = threeRoomTerminalFixture();
  const system = project.hvacSystems[0];
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EGA6",
  )!;
  const solutions = sizeAirTerminal(system.airflowM3h!, 1, family, "return");
  expect(solutions.length).toBeGreaterThan(0);
  expect(
    solutions.some((item) => acousticUpperBound(item.operatingPoint)! > 37),
  ).toBe(true);
  expect(
    solutions.some(
      (item) => item.variant.widthMm === 1000 && item.variant.heightMm === 200,
    ),
  ).toBe(true);
  expect(
    solutions.some(
      (item) => item.variant.widthMm === 600 && item.variant.heightMm === 600,
    ),
  ).toBe(true);
  expect(sizeAirTerminal(system.airflowM3h!, 1, family, "supply")).toEqual([]);
  const solution = solutions.find(
    (item) =>
      item.variant.widthMm === 600 &&
      item.variant.heightMm === 600 &&
      item.quantityPerPoint === 1,
  )!;
  expect(solution).toBeDefined();
  const next = addOperatorTerminal(project, {
    roomId: system.roomIds[0],
    systemId: system.id,
    familyCode: "EGA6",
    variantId: solution.variant.id,
    operatingPointIndex: solution.variant.operatingPoints.indexOf(
      solution.operatingPoint,
    ),
    use: "return",
    mounting: "ceiling",
    lengthMm: 600,
  });
  expect(next.airTerminals.at(-1)).toMatchObject({
    family: "EGA6",
    use: "return",
    widthMm: 600,
    heightMm: 600,
    style: "Chiusura PUSH (a richiesta)",
  });
  expect(next.airTerminals.at(-1)!.manualDimensions).not.toBe(true);
  const checks = validateProject(next);
  expect(checks.filter((check) => check.code === "returnAirflow")).toHaveLength(
    1,
  );
  expect(checks).toContainEqual(
    expect.objectContaining({
      code: "returnAirflow",
      entityId: system.id,
      status: "valid",
    }),
  );
  expect(checks).toContainEqual(
    expect.objectContaining({
      code: "noise",
      entityId: next.airTerminals.at(-1)!.id,
      status: "valid",
    }),
  );
  const refreshed = refreshDuctedBindings(next);
  const edited = editOperatorTerminal(
    {
      ...refreshed,
      airTerminals: refreshed.airTerminals.map((terminal) => ({
        ...terminal,
        manualDimensions: true,
      })),
    },
    refreshed.airTerminals.at(-1)!.id,
    { finish: "Bianco", widthMm: 620 },
  );
  expect(edited.airTerminals.at(-1)).toMatchObject({
    family: "EGA6",
    finish: "Bianco",
    widthMm: 620,
    heightMm: 600,
    manualDimensions: true,
  });
  const nominal = editOperatorTerminal(
    {
      ...refreshed,
      airTerminals: refreshed.airTerminals.map((terminal) => ({
        ...terminal,
        manualDimensions: false,
      })),
    },
    refreshed.airTerminals.at(-1)!.id,
    { finish: "Bianco" },
  );
  expect(nominal.airTerminals.at(-1)).toMatchObject({
    widthMm: 600,
    heightMm: 600,
    manualDimensions: false,
    finish: "Bianco",
  });
  expect(refreshed.airTerminals.at(-1)!.requiredAirflowM3h).toBe(
    system.airflowM3h,
  );
  expect(calculateSupplyPlenum(refreshed, system.id)).toMatchObject({
    returnComplete: true,
    returnAirflowM3h: system.airflowM3h,
    pendingReturnPoints: [],
  });
});

it("supply retains the 37 dB limit while return ignores only the noise threshold", () => {
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === "EDLS",
  )!;
  const loud = {
    ...family,
    variants: family.variants.map((variant) => ({
      ...variant,
      operatingPoints: variant.operatingPoints.map((point) => ({
        ...point,
        noiseDbA: 45,
        noiseUpperBoundDbA: null,
      })),
    })),
  };
  expect(sizeAirTerminal(500, 1, loud, "supply")).toEqual([]);
  const returned = {
    ...loud,
    use: ["return"] as "return"[],
    variants: loud.variants.map((variant) => ({
      ...variant,
      operatingPoints: variant.operatingPoints.map((point) => ({
        ...point,
        use: "return" as const,
      })),
    })),
  };
  expect(sizeAirTerminal(500, 1, returned, "return").length).toBeGreaterThan(0);
  expect(
    sizeAirTerminal(
      500,
      1,
      {
        ...returned,
        variants: returned.variants.map((variant) => ({
          ...variant,
          operatingPoints: variant.operatingPoints.map((point) => ({
            ...point,
            quality: "review" as const,
          })),
        })),
      },
      "return",
    ),
  ).toEqual([]);
});
