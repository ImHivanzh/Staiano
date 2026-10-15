import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import { placeMachineOnPlan } from "@/domain/ducted/graphic-installation";
import { connectionSelection } from "./connection-selection";

it("pairs a machine and terminal in either order and leaves incomplete selection alone", () => {
  const base = guidedProjectFixture();
  const placed = placeMachineOnPlan(
    base,
    base.hvacSystems[0].id,
    base.rooms[0].id,
    { x: 2, y: 4 },
  );
  const project = addGuidedTerminal(placed, 1000);
  const system = project.hvacSystems[0];
  const machineId = system.indoorUnits[0].id;
  const terminalId = project.airTerminals[0].id;
  const pair = { systemId: system.id, machineId, terminalId };
  expect(connectionSelection(project, machineId, terminalId)).toEqual(pair);
  expect(connectionSelection(project, terminalId, machineId)).toEqual(pair);
  expect(connectionSelection(project, undefined, terminalId)).toBeNull();
  expect(connectionSelection(project, machineId, machineId)).toBeNull();
  expect(connectionSelection(project, terminalId, "unknown")).toBeNull();
});
