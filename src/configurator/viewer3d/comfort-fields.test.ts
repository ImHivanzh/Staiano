import { expect, it } from "vitest";
import { pdfQaFixture } from "../../../scripts/verification/pdf-fixture";
import { comfortFields } from "./comfort-fields";

it("uses real devices, reverses return flow and emits radiator convection only in heating", () => {
  const project = pdfQaFixture();
  const cool = comfortFields(project, project.floors[0].id, "cool");
  const heat = comfortFields(project, project.floors[0].id, "heat");
  const ids = new Set(
    [
      ...project.airTerminals,
      ...project.radiators,
      ...(project.fanCoils ?? []),
      ...project.hvacSystems.flatMap((s) => s.indoorUnits),
    ].map((d) => d.id),
  );
  expect(cool.length).toBeGreaterThan(0);
  expect(
    cool.every((f) => ids.has(f.deviceId) && f.kind !== "convection"),
  ).toBe(true);
  const radiator = project.radiators[0];
  expect(
    heat
      .filter((f) => f.deviceId === radiator.id)
      .every((f) => f.end[1] > f.start[1]),
  ).toBe(true);
  const returned = project.airTerminals.find((t) => t.use === "return")!;
  expect(cool.find((f) => f.deviceId === returned.id)?.end[1]).toBeCloseTo(
    returned.elevationM! - 0.01,
  );
});
