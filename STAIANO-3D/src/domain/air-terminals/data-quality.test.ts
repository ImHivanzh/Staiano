import { expect, it } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { airTerminalCoverage, terminalDataQuality } from "./data-quality";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";

it("counts commercial-length faces and documented profile depths without promoting review or absent acoustic data", () => {
  const original = airTerminalCatalog.families.find(
    (family) => family.familyCode === "EDFL-20",
  )!;
  const variant = original.variants[0];
  const family = {
    ...original,
    variants: [
      {
        ...variant,
        faceWidthMm: null,
        faceHeightMm: 50,
        bodyDepthMm: null,
        lengthMm: null,
        modelCode: undefined,
        modelCodes: [],
        commercialLengthsMm: [1000],
        operatingPoints: [
          {
            ...variant.operatingPoints[0],
            quality: "review" as const,
            noiseDbA: null,
            noiseUpperBoundDbA: null,
          },
          {
            ...variant.operatingPoints[0],
            quality: "valid" as const,
            noiseDbA: 30,
            noiseUpperBoundDbA: null,
          },
        ],
      },
    ],
  };
  expect(airTerminalCoverage(family)).toEqual({
    variants: 1,
    validPoints: 1,
    reviewPoints: 1,
    acousticMissing: 1,
    faces: 1,
    depths: 1,
  });
  expect(family.variants[0].operatingPoints[0].quality).toBe("review");
});

it("keeps missing historical revisions, manual dimensions and missing prices explicit", () => {
  const project = addGuidedTerminal(guidedProjectFixture(), 2000);
  const terminal = project.airTerminals[0];
  terminal.depthMm = null;
  expect(terminalDataQuality(project, terminal).geometry).toContain(
    "profondità",
  );
  terminal.manualDimensions = true;
  expect(terminalDataQuality(project, terminal).geometry).toContain(
    "dall’operatore; profondità non dichiarata",
  );
  terminal.catalogVersion = "missing-history";
  const quality = terminalDataQuality(project, terminal);
  expect(quality.performance).toContain("da verificare");
  expect(quality.geometry).toContain("non disponibile");
  expect(quality.price).toContain("incompleta");
});
