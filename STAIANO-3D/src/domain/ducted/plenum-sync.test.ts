import { expect, it } from "vitest";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";
import { placeMachineOnPlan } from "./graphic-installation";
import {
  addMachinePlenum,
  machinePlenum,
  placedPlenumGeometry,
} from "./placement";
import {
  addTerminalPlenum,
  connectPlenum,
  insertPlenum,
  syncAttachedPlenums,
  terminalPlenum,
} from "./attached-plenums";
import { airConnectionRoutes, ductRoute, generateDuctRoutes } from "./routes";
import { editOperatorTerminal } from "../air-terminals/operator";
import {
  calculateEcoclimaBom,
  resolveTerminalAccessorySpecification,
} from "../air-terminals/commercial-bom";
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
  const excluded = {
    ...p,
    airTerminals: p.airTerminals.map((item) => ({
      ...item,
      commercialOptions: {
        ...item.commercialOptions!,
        insulatedPlenum: false,
        plenumMaterial: undefined,
      },
    })),
  };
  expect(() => addTerminalPlenum(excluded, terminal.id)).toThrow(/senza plenum/);
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
  expect(separate.lines.find((line) => line.id.endsWith(":plenum"))).toMatchObject(
    { status: "unknown", unitPriceCents: null },
  );
});

it("updates the saved terminal plenum and flexible branches through the real commit, preserving manual curves", () => {
  let p = fixture();
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
  p = addMachinePlenum(p, p.hvacSystems[0].indoorUnits[0].id);
  const id = p.airTerminals[0].id;
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
  const terminal = next.airTerminals[0];
  const spec = resolveTerminalAccessorySpecification(terminal)!.plenum!;
  const body = next.plenums.find((pl) => pl.attachmentId === id)!;
  expect(body.widthMm).toBe(2000);
  expect(body.portCount).toBe(spec.portCount);
  expect(body.portDiameterMm).toBe(spec.portDiameterMm);
  expect(next.ducts).toHaveLength(spec.portCount);
  expect(next.ducts!.find((d) => d.id === ductId)!.waypoints).toEqual([
    waypoint,
  ]);
  expect(next.ducts!.every((d) => d.diameterMm === spec.portDiameterMm)).toBe(
    true,
  );
  const source = machinePlenum(next, terminal.systemId!, "supply")!;
  expect(placedPlenumGeometry(next, source)!.ports).toHaveLength(
    spec.portCount,
  );
  useProjectStore
    .getState()
    .commit((current) => editOperatorTerminal(current, id, { widthMm: 1000 }));
  expect(useProjectStore.getState().error).toBeNull();
  const smaller = useProjectStore.getState().project!;
  expect(smaller.ducts).toHaveLength(1);
  expect(smaller.ducts![0].id).toBe(ductId);
  expect(smaller.ducts![0].waypoints).toEqual([waypoint]);
});

it("refreshes generated machine branches after a terminal gains a second collar", () => {
  let p = fixture();
  p = addMachinePlenum(p, p.hvacSystems[0].indoorUnits[0].id);
  p = generateDuctRoutes(p, p.hvacSystems[0].id);
  const first = p.ducts!.find((d) => d.terminalId)!;
  first.routing = "manual";
  first.waypoints = [{ x: 3.5, y: 3.5, elevationM: 2.5 }];
  const next = syncAttachedPlenums(
    editOperatorTerminal(p, p.airTerminals[0].id, { widthMm: 2000 }),
    p,
  );
  expect(next.ducts!.filter((d) => d.terminalId)).toHaveLength(2);
  expect(next.ducts!.find((d) => d.id === first.id)!.waypoints).toEqual(
    first.waypoints,
  );
});

it("renders no connection for a terminal without a plenum, including stale saved bodies", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  terminal.commercialOptions = undefined;
  expect(terminalPlenum(p, terminal)).toBeNull();
  expect(airConnectionRoutes(p, terminal.floorId)).toEqual([]);
  let attached = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  attached = connectPlenum(attached, attached.plenums[0].id, terminal.id);
  const changed = {
    ...attached,
    airTerminals: attached.airTerminals.map((t) => ({
      ...t,
      commercialOptions: {
        ...t.commercialOptions!,
        insulatedPlenum: false,
        plenumMaterial: undefined,
      },
    })),
  };
  expect(terminalPlenum(changed, changed.airTerminals[0])).toBeNull();
  expect(ductRoute(changed, changed.ducts![0])).toEqual([]);
  const next = syncAttachedPlenums(changed, attached);
  expect(next.plenums).toHaveLength(0);
  expect(next.ducts).toHaveLength(0);
  expect(next.airTerminals[0].plenumId).toBeNull();
});

it("keeps a galvanized plenum and its connections when the insulated option is off", () => {
  const p = fixture();
  p.airTerminals[0].commercialOptions = {
    ...p.airTerminals[0].commercialOptions!,
    insulatedPlenum: false,
    plenumMaterial: "galvanized",
  };
  expect(terminalPlenum(p, p.airTerminals[0])?.material).toBe("galvanized");
});
