import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseProject } from "@/services/project/format";
import { pdfQaFixture } from "../../../scripts/verification/pdf-fixture";
import { comfortFields } from "./comfort-fields";

it("uses real devices, reverses return flow and emits radiator convection only in heating", () => {
  const project = pdfQaFixture();
  const ductedTerminalIds = new Set(
    project.airTerminals
      .filter((terminal) => terminal.systemId)
      .map((terminal) => terminal.id),
  );
  const returnedTerminal = project.airTerminals.find(
    (terminal) => terminal.use === "return",
  )!;
  project.airTerminals.push({
    ...returnedTerminal,
    id: "standalone-return",
    systemId: null,
  });
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
  expect(cool.every((field) => !ductedTerminalIds.has(field.deviceId))).toBe(
    true,
  );
  expect(
    cool.every((f) => ids.has(f.deviceId) && f.kind !== "convection"),
  ).toBe(true);
  const radiator = project.radiators[0];
  expect(
    heat
      .filter((f) => f.deviceId === radiator.id)
      .every((f) => f.end[1] > f.start[1]),
  ).toBe(true);
  const returned = project.airTerminals.find(
    (terminal) => terminal.id === "standalone-return",
  )!;
  expect(cool.find((f) => f.deviceId === returned.id)?.end[1]).toBeCloseTo(
    returned.elevationM! - 0.01,
  );
});

it("rises in heating and sinks in cooling for real split, ceiling and wall outlets", () => {
  const project = pdfQaFixture();
  const house = parseProject(
    JSON.parse(readFileSync("tests/fixtures/realistic-home.hvacproj", "utf8")),
  );
  const split = house.hvacSystems.find((s) => s.type === "split")!;
  project.hvacSystems.push(split);
  project.rooms.push(...house.rooms);
  const supply = project.airTerminals.find(
    (terminal) => terminal.use === "supply",
  )!;
  project.airTerminals.push({
    ...supply,
    id: "standalone-supply",
    systemId: null,
  });
  project.fanCoils!.push({
    ...project.fanCoils![0],
    id: "ceiling-fan",
    mounting: "ceiling",
    elevationM: project.rooms.find((r) => r.id === project.fanCoils![0].roomId)!
      .heightM,
  });
  const floorId = project.floors[0].id;
  // Include the split on the fixture's active floor.
  split.indoorUnits.forEach((unit) => {
    unit.floorId = floorId;
  });
  const cool = comfortFields(project, floorId, "cool");
  const heat = comfortFields(project, floorId, "heat");
  const outlets = [
    ...project.airTerminals.filter((t) => t.use === "supply" && !t.systemId),
    ...project.fanCoils!,
    ...split.indoorUnits,
  ];
  for (const outlet of outlets) {
    const room = project.rooms.find((r) => r.id === outlet.roomId)!;
    const cooling = cool.filter((f) => f.deviceId === outlet.id);
    const heating = heat.filter((f) => f.deviceId === outlet.id);
    expect(cooling).toHaveLength(3);
    expect(heating).toHaveLength(3);
    for (const field of cooling) {
      expect(field.end[1]).toBeLessThan(field.control[1]);
      expect(field.control[1]).toBeLessThan(field.start[1]);
      expect(field.end[1]).toBeGreaterThan(0);
    }
    for (const field of heating) {
      expect(field.end[1]).toBeGreaterThan(field.control[1]);
      expect(field.control[1]).toBeGreaterThan(field.start[1]);
      expect(field.end[1]).toBeLessThan(room.heightM);
    }
  }
  expect(heat.filter((f) => f.kind === "return")).toEqual(
    cool.filter((f) => f.kind === "return"),
  );
});
