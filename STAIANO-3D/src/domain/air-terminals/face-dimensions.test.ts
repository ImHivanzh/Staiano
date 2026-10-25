import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { parseProject } from "@/services/project/format";
import { applyCommercialModelFace } from "./face-dimensions";

it("applies the selected EBL frame geometry and clears its manual-size warning", () => {
  const project = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  const terminal = {
    ...project.airTerminals[0],
    family: "EBL",
    productId: "ecoclima-ebl-600x75",
    catalogVersion: airTerminalCatalog.version,
    widthMm: 600,
    heightMm: 75,
    manualDimensions: true,
  };
  expect(applyCommercialModelFace(terminal, "EBL-20/0°")).toMatchObject({
    widthMm: 635,
    heightMm: 110,
    manualDimensions: false,
  });
  expect(applyCommercialModelFace(terminal, "EBL-22/0°")).toMatchObject({
    widthMm: 599,
    heightMm: 74,
    manualDimensions: false,
  });
  expect(applyCommercialModelFace(terminal, "unknown")).toBe(terminal);
});
