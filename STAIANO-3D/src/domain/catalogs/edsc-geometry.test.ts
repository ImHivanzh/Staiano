import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import previous from "../../../catalog-data/generated/ecoclima.previous.json";
import {
  airTerminalCatalog,
  airTerminalCatalogAtVersion,
} from "./air-terminals";
import { airTerminalCatalogSchema } from "./air-terminal-schema";
import { addRectangle, createProject } from "../project";
import { applyAirTerminalSolution } from "../air-terminals/apply";
import { sizeAirTerminal } from "../air-terminals/size";

const family = airTerminalCatalog.families.find(
  (f) => f.familyCode === "EDSC-C",
)!;
const digest = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
// Un re-import aggiorna legittimamente sourceMetadata (SHA-256 della pagina, istante
// di import): la provenienza rigenerata non fa parte dei dati pubblicati confrontati qui.
const withoutSourceMetadata = (family: { sourceMetadata?: unknown }) =>
  Object.fromEntries(
    Object.entries(family).filter(([key]) => key !== "sourceMetadata"),
  );

describe("original EDSC-C geometry drawings", () => {
  it.each([
    [100, 238, 90.2, 176, 307.7],
    [125, 238, 95.2, 176, 307.7],
    [160, 298, 92.2, 231, 372],
  ])(
    "keeps nominal %i separate from physical body, cover and brackets",
    (nominal, body, height, cover, brackets) => {
      const variant = family.variants.find(
        (v) => v.nominalDiameterMm === nominal,
      )!;
      expect(variant.connectionDiameterMm).toBe(nominal);
      expect([
        variant.faceWidthMm,
        variant.faceHeightMm,
        variant.bodyDepthMm,
      ]).toEqual([body, body, height]);
      expect(variant.originalDimensionsMm).toEqual({
        bodyDiameterMm: body,
        coverDiameterMm: cover,
        bracketWidthMm: brackets,
        heightMm: height,
      });
      expect(variant.dimensionDrawing).toBeDefined();
      expect(
        digest(
          join(process.cwd(), "public", variant.dimensionDrawing!.localPath),
        ),
      ).toBe(variant.dimensionDrawing!.sha256);
    },
  );

  it("retains the exact embedded OEM image bytes and HTML provenance", () => {
    const source = join(
      process.cwd(),
      "catalog-data/sources/ecoclima/complete-edsc-c-96ed3c92.html",
    );
    const html = readFileSync(source, "utf8");
    expect(digest(source)).toBe(family.sourceMetadata.sha256);
    const table = html
      .split("Dimensioni EDSC-C</h4>")[1]
      .split("Dimensioni EDSC-CC</h4>")[0];
    const images = [...table.matchAll(/src="data:image\/png;base64,([^"]+)"/g)];
    expect(images).toHaveLength(3);
    for (const [index, variant] of family.variants.entries()) {
      const original = Buffer.from(images[index][1], "base64");
      const stored = readFileSync(
        join(process.cwd(), "public", variant.dimensionDrawing!.localPath),
      );
      expect(stored.equals(original)).toBe(true);
      expect(variant.dimensionDrawing!.sourceUrl).toBe(
        family.sourceMetadata.sourceUrl,
      );
    }
  });

  it("applies a circular terminal with published envelope without manual geometry", () => {
    let project = createProject();
    project = addRectangle(project, project.floors[0].id, {
      width: 5,
      length: 4,
      height: 2.7,
      name: "Soggiorno",
    });
    const solution = sizeAirTerminal(70, 1, family, "supply").find(
      (s) => s.variant.nominalDiameterMm === 100,
    )!;
    expect(solution).toBeDefined();
    project = applyAirTerminalSolution(
      project,
      project.rooms[0].id,
      null,
      "supply",
      "EDSC-C",
      solution,
      "ceiling",
    );
    expect(project.airTerminals[0]).toMatchObject({
      widthMm: 238,
      heightMm: 238,
      depthMm: 90.2,
      shape: "circle",
    });
  });

  it("preserves all operating points, other families and previous catalog lookup", () => {
    const before = airTerminalCatalogSchema.parse(previous);
    expect(airTerminalCatalogAtVersion(before.version)).toEqual(before);
    expect(airTerminalCatalog.families).toHaveLength(before.families.length);
    for (const old of before.families) {
      const current = airTerminalCatalog.families.find(
        (f) => f.familyCode === old.familyCode,
      )!;
      if (old.familyCode !== "EDSC-C")
        expect(withoutSourceMetadata(current)).toEqual(
          withoutSourceMetadata(old),
        );
      else
        for (const variant of old.variants)
          expect(
            current.variants.find((v) => v.id === variant.id)!.operatingPoints,
          ).toEqual(variant.operatingPoints);
    }
  });
});
