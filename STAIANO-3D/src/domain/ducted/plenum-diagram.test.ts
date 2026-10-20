import { expect, it } from "vitest";
import type { PlenumBranch, SupplyPlenum } from "./plenum";
import { plenumBranchGroups, plenumDiagramSvg } from "./plenum-diagram";

const branch = (
  id: string,
  diameterMm: number | null,
  verified = true,
): PlenumBranch => ({
  id,
  diameterMm,
  verified,
  roomId: "room",
  roomName: "Camera & studio",
  pointIndex: 0,
  terminalIds: [id],
  terminalModels: ["EDLS"],
  airflowM3h: 50,
  minimumDiameterMm: null,
  velocityMs: null,
});
const branches = Array.from({ length: 6 }, (_, i) => branch(`port-${i}`, 145));
const result: SupplyPlenum = {
  use: "supply",
  systemId: "system",
  systemName: "Mandata",
  machineModel: "Macchina <test>",
  machineAirflowM3h: 300,
  settings: { grouping: "terminal", maxBranchVelocityMs: 2.5 },
  status: "pending",
  branches,
  groupedDiameters: [{ diameterMm: 145, quantity: 6 }],
  supplyAirflowM3h: 300,
  supplyComplete: true,
  pendingSupplyPoints: [],
  returnTerminalCount: 0,
  returnAirflowM3h: 0,
  returnComplete: false,
  pendingReturnPoints: [],
  issues: [],
};

it("defaults to 6 × Ø145, totals airflow and preserves individual detail", () => {
  const svg = plenumDiagramSvg(result);
  expect(svg).toContain("6 × Ø 145 mm");
  expect(svg).toContain("300 m³/h totali");
  expect(svg.match(/data-port-id=/g)).toHaveLength(1);
  expect(svg).toContain("Camera &amp; studio");
  expect(svg).toContain("Macchina &lt;test&gt;");
  const detailed = plenumDiagramSvg(result, false);
  expect(detailed.match(/data-port-id=/g)).toHaveLength(6);
  expect(detailed).not.toContain("m³/h totali");
  expect(branches).toHaveLength(6);
});

it("keeps all diameters and unknown ports, marking partially verified groups", () => {
  const mixed = [
    branch("a", 200),
    branch("b", null, false),
    ...branches,
    branch("c", 145, false),
  ];
  const groups = plenumBranchGroups(mixed);
  expect(groups.map((group) => [group[0].diameterMm, group.length])).toEqual([
    [145, 7],
    [200, 1],
    [null, 1],
  ]);
  expect(groups.flat()).toHaveLength(mixed.length);
  const svg = plenumDiagramSvg({ ...result, branches: mixed });
  expect(svg).toContain("1 × Ø da verificare");
  expect(svg).toContain("6/7 diametri verificati");
  expect(svg).toContain('stroke-dasharray="4 3"');
  expect(plenumBranchGroups([])).toEqual([]);
  expect(
    plenumDiagramSvg({ ...result, branches: [], groupedDiameters: [] }),
  ).toContain("Inserire le bocchette di mandata");
});
