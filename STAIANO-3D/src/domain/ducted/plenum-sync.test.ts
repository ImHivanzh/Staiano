import { expect, it } from "vitest";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";
import { placeMachineOnPlan } from "./graphic-installation";
import { addMachinePlenum } from "./placement";
import {
  addTerminalPlenum,
  connectPlenum,
  insertPlenum,
  syncAttachedPlenums,
  terminalPlenum,
} from "./attached-plenums";
import { airConnectionRoutes, generateDuctRoutes } from "./routes";
import { editOperatorTerminal } from "../air-terminals/operator";
import { calculateEcoclimaBom } from "../air-terminals/commercial-bom";
import { useProjectStore } from "@/stores/project-store";
import { projectSchema } from "@/schemas/project";

function fixture() {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  return addGuidedTerminal(p, 1000);
}

it("creates a connected machine plenum only for a configured unlocked machine", () => {
  const p = fixture();
  expect(() => addMachinePlenum(p, p.airTerminals[0].id)).toThrow(
    /macchina configurata/,
  );
  const machine = p.hvacSystems[0].indoorUnits[0];
  const next = addMachinePlenum(p, machine.id);
  expect(next.plenums).toHaveLength(1);
  expect(next.plenums[0].systemId).toBe(p.hvacSystems[0].id);
  expect(next.plenums[0].position).not.toEqual(machine.position);
  expect(projectSchema.safeParse(next).success).toBe(true);
  expect(() => addMachinePlenum(next, machine.id)).toThrow(/ripresa/i);
  machine.locked = true;
  expect(() => addMachinePlenum(p, machine.id)).toThrow(/Sblocca/);
});

it("creates the bocchetta plenum only for a configured unlocked bocchetta", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  expect(() =>
    addTerminalPlenum(p, p.hvacSystems[0].indoorUnits[0].id),
  ).toThrow(/bocchetta configurata/);
  terminal.locked = true;
  expect(() => addTerminalPlenum(p, terminal.id)).toThrow(/Sblocca/);
  terminal.locked = false;
  const next = addTerminalPlenum(p, terminal.id);
  expect(next.plenums).toHaveLength(1);
  const plenum = next.plenums[0];
  expect(plenum.attachmentId).toBe(terminal.id);
  expect(plenum.status).toBe("proposed");
  expect(next.airTerminals[0].plenumId).toBe(plenum.id);
  expect(projectSchema.safeParse(next).success).toBe(true);
  expect(() => addTerminalPlenum(next, terminal.id)).toThrow(/già un plenum/);
});

it("keeps the catalogue price of a bocchetta plenum and quotes only custom bodies separately", () => {
  let p = fixture();
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  const catalogue = calculateEcoclimaBom(p);
  const price = catalogue.lines.find(
    (line) => line.kind === "insulated-plenum",
  );
  expect(price?.unitPriceCents).not.toBeNull();
  expect(catalogue.lines.some((line) => line.id.endsWith(":plenum"))).toBe(
    false,
  );
  const custom = {
    ...p,
    plenums: p.plenums.map((plenum) => ({
      ...plenum,
      model: "Plenum su misura",
      depthMm: plenum.depthMm + 100,
    })),
  };
  const separate = calculateEcoclimaBom(custom);
  expect(
    separate.lines.filter((line) => line.kind === "insulated-plenum"),
  ).toHaveLength(1);
  expect(
    separate.lines.find((line) => line.id.endsWith(":plenum")),
  ).toMatchObject({ status: "unknown", unitPriceCents: null });
});

it("keeps a connected plenum and its flexible branch through a terminal edit", () => {
  let p = fixture();
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
  p = addMachinePlenum(p, p.hvacSystems[0].indoorUnits[0].id);
  const id = p.airTerminals[0].id;
  const bodyBefore = p.plenums.find((pl) => pl.attachmentId === id)!;
  const waypoint = { x: 3.5, y: 3.5, elevationM: 2.5 };
  p.ducts![0] = { ...p.ducts![0], routing: "manual", waypoints: [waypoint] };
  const ductId = p.ducts![0].id;
  useProjectStore.setState({
    project: p,
    readOnly: false,
    past: [],
    future: [],
  });
  useProjectStore
    .getState()
    .commit((current) => editOperatorTerminal(current, id, { widthMm: 2000 }));
  expect(useProjectStore.getState().error).toBeNull();
  const next = useProjectStore.getState().project!;
  const body = next.plenums.find((pl) => pl.attachmentId === id)!;
  // Corpo separato: la modifica della bocchetta non ne cambia misure o stacchi.
  expect(body.widthMm).toBe(bodyBefore.widthMm);
  expect(body.portCount).toBe(bodyBefore.portCount);
  expect(body.portDiameterMm).toBe(bodyBefore.portDiameterMm ?? 160);
  expect(next.ducts).toHaveLength(body.portCount ?? 1);
  expect(next.ducts!.find((d) => d.id === ductId)!.waypoints).toEqual([
    waypoint,
  ]);
  useProjectStore
    .getState()
    .commit((current) => editOperatorTerminal(current, id, { widthMm: 1000 }));
  expect(useProjectStore.getState().error).toBeNull();
  const smaller = useProjectStore.getState().project!;
  expect(smaller.ducts).toHaveLength(body.portCount ?? 1);
  expect(smaller.ducts![0].id).toBe(ductId);
  expect(smaller.ducts![0].waypoints).toEqual([waypoint]);
});

it("keeps the separate plenum where it is when the terminal changes", () => {
  let p = fixture();
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p = addMachinePlenum(p, p.hvacSystems[0].indoorUnits[0].id);
  p = generateDuctRoutes(p, p.hvacSystems[0].id);
  const bodyBefore = p.plenums.find(
    (pl) => pl.attachmentId === p.airTerminals[0].id,
  )!;
  const first = p.ducts!.find((d) => d.terminalId)!;
  first.routing = "manual";
  first.waypoints = [{ x: 3.5, y: 3.5, elevationM: 2.5 }];
  const next = syncAttachedPlenums(
    editOperatorTerminal(p, p.airTerminals[0].id, { widthMm: 2000 }),
    p,
  );
  const bodyAfter = next.plenums.find(
    (pl) => pl.attachmentId === next.airTerminals[0].id,
  )!;
  // Due corpi separati: il plenum non si ridimensiona con la bocchetta.
  expect(bodyAfter.widthMm).toBe(bodyBefore.widthMm);
  expect(bodyAfter.portCount).toBe(bodyBefore.portCount);
  expect(bodyAfter.model).toBe(bodyBefore.model);
  expect(next.ducts!.find((d) => d.id === first.id)!.waypoints).toEqual(
    first.waypoints,
  );
});

it("creates no connection and no body for a terminal without its own plenum", () => {
  let p = fixture();
  p = addMachinePlenum(p, p.hvacSystems[0].indoorUnits[0].id);
  const terminal = p.airTerminals[0];
  expect(terminal.plenumId).toBeNull();
  expect(terminalPlenum(p, terminal)).toBeNull();
  expect(airConnectionRoutes(p, terminal.floorId)).toEqual([]);
  p = addTerminalPlenum(p, terminal.id);
  expect(terminalPlenum(p, p.airTerminals[0])).not.toBeNull();
});

it("keeps a galvanized separate body and its connection", () => {
  let p = fixture();
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p = {
    ...p,
    plenums: p.plenums.map((pl) => ({ ...pl, material: "galvanized" })),
  };
  expect(terminalPlenum(p, p.airTerminals[0])?.material).toBe("galvanized");
  expect(p.airTerminals[0].plenumId).toBe(p.plenums[0].id);
});
