import { expect, it } from "vitest";
import {
  threeRoomTerminalFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import { terminalAirflowBalance } from "./airflow-balance";

it("keeps supply per room, centralized return and separate machines independent", () => {
  const project = addGuidedTerminal(threeRoomTerminalFixture(), 6000);
  const systemId = project.hvacSystems[0].id;
  const ownTerminal = project.airTerminals[0];
  project.hvacSystems.push({
    ...structuredClone(project.hvacSystems[0]),
    id: "other-machine",
  });
  project.airTerminals.push({
    ...ownTerminal,
    id: "other-terminal",
    systemId: "other-machine",
  });
  const room = terminalAirflowBalance(
    project,
    systemId,
    "supply",
    project.rooms[0].id,
  );
  expect(room.remaining).toBe(0);
  expect(room.excess).toBeGreaterThan(0);
  const emptyRoom = terminalAirflowBalance(
    project,
    systemId,
    "supply",
    project.rooms[1].id,
  );
  expect(emptyRoom.remaining).toBe(emptyRoom.required);
  expect(emptyRoom.installed).toBe(0);
  const total = terminalAirflowBalance(project, systemId, "supply");
  expect(total.remaining).toBeCloseTo(0);
  const returned = terminalAirflowBalance(
    project,
    systemId,
    "return",
    project.rooms[1].id,
  );
  expect(returned.required).toBe(total.required);
  expect(returned.installed).toBe(0);
  expect(
    terminalAirflowBalance(project, "other-machine", "supply").installed,
  ).toBe(ownTerminal.availableAirflowM3h);
  project.airTerminals.push({
    ...ownTerminal,
    id: "return-grille",
    use: "return",
    roomId: project.rooms[0].id,
  });
  expect(
    terminalAirflowBalance(project, systemId, "return", project.rooms[1].id)
      .installed,
  ).toBe(ownTerminal.availableAirflowM3h);
});
