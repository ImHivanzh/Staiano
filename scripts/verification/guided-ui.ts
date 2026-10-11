import { mkdirSync, writeFileSync } from "node:fs";
import {
  guidedProjectFixture,
  addGuidedTerminal,
  threeRoomTerminalFixture,
} from "../../tests/guided-fixture";
import { recomputeProject } from "../../src/domain/project";
import { placeSupplyPlenum } from "../../src/domain/ducted/placement";
import { calculateSupplyPlenum } from "../../src/domain/ducted/plenum";

const empty = guidedProjectFixture();
let network = guidedProjectFixture();
for (const length of [2000, 2000, 2000])
  network = addGuidedTerminal(network, length);
network = placeSupplyPlenum(network, network.hvacSystems[0].id);
const single = addGuidedTerminal(guidedProjectFixture(), 1000);
const threeRooms = recomputeProject(threeRoomTerminalFixture());
const firstPorts = calculateSupplyPlenum(
  network,
  network.hvacSystems[0].id,
).machineGeometry!.ports.filter((port) =>
  port.branch.terminalIds.includes(network.airTerminals[0].id),
).length;
const otherPorts =
  calculateSupplyPlenum(network, network.hvacSystems[0].id).machineGeometry!
    .ports.length - firstPorts;
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/guided-ui-fixtures.json",
  JSON.stringify({ empty, network, single, threeRooms, otherPorts }),
);
