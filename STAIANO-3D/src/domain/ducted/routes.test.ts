import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import { placeMachineOnPlan } from "./graphic-installation";
import {
  addTerminalPlenum,
  insertPlenum,
  connectPlenum,
  terminalPlenum,
  plenumPortsUpper,
} from "./attached-plenums";
import { machinePlenum, placeSupplyPlenum } from "./placement";
import { flexibleDuctCurve } from "./flexible-curve";
import { Vector3 } from "three";
import {
  addDuctWaypoint,
  createDuctFromEndpoints,
  ductRoute,
  moveDuctWaypoint,
  removeDuctWaypoint,
} from "./routes";
import { projectSchema } from "@/schemas/project";
import { movePlacedDevice } from "../geometry/move-device";
import { validateProject } from "../validation";
import { decodeProject, encodeProject } from "@/services/project/format";

/** Bocchetta e macchina con i rispettivi plenum salvati, macchina posizionata in pianta. */
function fixture(mounting: "wall" | "ceiling" = "ceiling") {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
    x: 3,
    y: 3,
  });
  p = addGuidedTerminal(p, 2000, "EDLS", mounting);
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
  return placeSupplyPlenum(p, p.hvacSystems[0].id);
}

it.each(
  [0, Math.PI / 2, Math.PI].flatMap((rotation) =>
    (["lateral", "upper"] as const).map((position) => ({ rotation, position })),
  ),
)(
  "manual flexible routes enter the visible $position collar from outside at rotation $rotation",
  ({ rotation, position }) => {
    const p = fixture("ceiling");
    p.hvacSystems[0].indoorUnits[0].rotation = rotation;
    p.airTerminals[0].rotation = rotation;
    // Lo stacco è un dato del plenum separato.
    p.plenums[0].connectionPosition = position;
    const terminal = p.airTerminals[0];
    const result = createDuctFromEndpoints(p, terminal.id, p.hvacSystems[0].id);
    const source = machinePlenum(result.project, terminal.systemId!, "supply")!;
    const target = terminalPlenum(result.project, terminal)!;
    const outward = plenumPortsUpper(result.project, target)
      ? new Vector3(0, 1, 0)
      : new Vector3(Math.sin(target.rotation), 0, -Math.cos(target.rotation));
    for (const id of result.ductIds) {
      const duct = result.project.ducts!.find((d) => d.id === id)!;
      const path = flexibleDuctCurve(
        ductRoute(result.project, duct),
        duct.diameterMm!,
      )!;
      expect(path).not.toBeNull();
      expect(
        path.curve
          .getTangentAt(0)
          .dot(
            new Vector3(
              -Math.sin(source.rotation),
              0,
              Math.cos(source.rotation),
            ),
          ),
      ).toBeGreaterThan(0.99);
      expect(path.curve.getTangentAt(1).dot(outward)).toBeLessThan(-0.99);
    }
  },
);

it("creates the predefined route from the plenum collar to the machine, fully editable", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  const result = createDuctFromEndpoints(p, plenum.id, machine.id);
  expect(projectSchema.safeParse(result.project).success).toBe(true);
  expect(result.terminalId).toBe(terminal.id);
  expect(result.systemId).toBe(p.hvacSystems[0].id);
  expect(result.ductIds.length).toBe(plenum.portCount);
  for (const id of result.ductIds) {
    const duct = result.project.ducts!.find((item) => item.id === id)!;
    expect(duct.routing).toBe("manual");
    expect(duct.waypoints.length).toBeGreaterThan(0);
    expect(duct.kind).toBe("flexible");
    expect(ductRoute(result.project, duct).length).toBeGreaterThanOrEqual(2);
  }
});

it("accepts the machine first and still anchors the route to the plenum collar", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  const result = createDuctFromEndpoints(p, machine.id, plenum.id);
  const duct = result.project.ducts!.find(
    (item) => item.id === result.ductIds[0],
  )!;
  const route = ductRoute(result.project, duct);
  expect(
    Math.hypot(
      route.at(-1)!.x - plenum.position.x,
      route.at(-1)!.y - plenum.position.y,
    ),
  ).toBeLessThan(plenum.widthMm / 1000);
});

it("connects a terminal that is still unconnected before proposing the route", () => {
  let p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  p = {
    ...p,
    airTerminals: p.airTerminals.map((item) =>
      item.id === terminal.id ? { ...item, systemId: null } : item,
    ),
    plenums: p.plenums.map((item) =>
      item.id === plenum.id ? { ...item, systemId: null } : item,
    ),
    ducts: [],
  };
  const result = createDuctFromEndpoints(p, plenum.id, machine.id);
  expect(
    result.project.airTerminals.find((item) => item.id === terminal.id)!
      .systemId,
  ).toBe(p.hvacSystems[0].id);
  expect(result.ductIds.length).toBe(plenum.portCount);
});

it("never rewrites a route already traced by the operator", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  const waypoint = { x: 2.5, y: 2.5, elevationM: 2.6 };
  const custom = {
    ...p,
    ducts: p.ducts!.map((duct) => ({
      ...duct,
      routing: "manual" as const,
      waypoints: [waypoint],
      decisionOrigin: "manual" as const,
    })),
  };
  const result = createDuctFromEndpoints(custom, plenum.id, machine.id);
  for (const duct of result.project.ducts!)
    expect(duct.waypoints).toEqual([waypoint]);
});

it("corrects collar entry on saved manual routes without rewriting their waypoints", () => {
  const p = fixture();
  const duct = {
    ...p.ducts![0],
    routing: "manual" as const,
    waypoints: [{ x: 2.5, y: 2.5, elevationM: 2.6 }],
  };
  const before = JSON.stringify(duct.waypoints);
  const route = ductRoute(p, duct);
  const terminal = p.airTerminals[0];
  const source = machinePlenum(p, terminal.systemId!, "supply")!;
  const target = terminalPlenum(p, terminal)!;
  const direction = (a: (typeof route)[number], b: (typeof route)[number]) =>
    new Vector3(b.x - a.x, b.elevationM - a.elevationM, b.y - a.y).normalize();
  expect(
    direction(route[0], route[1]).dot(
      new Vector3(-Math.sin(source.rotation), 0, Math.cos(source.rotation)),
    ),
  ).toBeGreaterThan(0.99);
  expect(
    direction(route.at(-2)!, route.at(-1)!).dot(
      new Vector3(Math.sin(target.rotation), 0, -Math.cos(target.rotation)),
    ),
  ).toBeLessThan(-0.99);
  expect(JSON.stringify(duct.waypoints)).toBe(before);
});

it("keeps the hose when the operator deletes every bend", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  const result = createDuctFromEndpoints(p, plenum.id, machine.id);
  let next = result.project;
  for (const id of result.ductIds) {
    const duct = next.ducts!.find((item) => item.id === id)!;
    expect(duct.waypoints.length).toBeGreaterThan(0);
    for (let i = duct.waypoints.length; i > 0; i--)
      next = removeDuctWaypoint(next, id, i - 1);
    expect(next.ducts!.find((item) => item.id === id)!.waypoints).toHaveLength(
      0,
    );
    expect(
      ductRoute(
        next,
        next.ducts!.find((item) => item.id === id)!,
      ),
    ).toHaveLength(4);
    // La curva si può reinserire: il tubo è ancora selezionabile.
    const added = addDuctWaypoint(next, id);
    expect(added.index).toBe(0);
    expect(
      ductRoute(
        added.project,
        added.project.ducts!.find((item) => item.id === id)!,
      ).length,
    ).toBeGreaterThan(4);
  }
});

it("asks for the machine plenum before tracing a duct", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
    x: 3,
    y: 3,
  });
  p = addGuidedTerminal(p, 2000);
  // Prima il corpo separato della bocchetta: senza, non esiste un estremo.
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  expect(() =>
    createDuctFromEndpoints(p, p.airTerminals[0].id, p.hvacSystems[0].id),
  ).toThrow(/strumento Plenum/);
});

it("saves an editable route by the wall even when automatic routing fails", () => {
  let p = fixture("wall");
  const terminal = p.airTerminals[0];
  p = movePlacedDevice(
    p,
    terminal.id,
    { x: 0.2, y: 3 },
    {
      enabled: true,
      grid: false,
      stepM: 0.1,
      toleranceM: 0.12,
      orthogonal: false,
      angle45: false,
      parallel: false,
    },
  );
  const plenum = terminalPlenum(p, p.airTerminals[0])!;
  expect(
    p
      .ducts!.filter((duct) => duct.terminalId === terminal.id)
      .every((duct) => ductRoute(p, duct).length === 0),
  ).toBe(true);
  const result = createDuctFromEndpoints(p, plenum.id, p.hvacSystems[0].id);
  const saved = decodeProject(encodeProject(result.project));
  for (const id of result.ductIds) {
    const duct = saved.ducts!.find((item) => item.id === id)!;
    expect(duct.routing).toBe("manual");
    expect(duct.waypoints.length).toBeGreaterThan(0);
    expect(ductRoute(saved, duct).length).toBeGreaterThan(1);
  }
  expect(validateProject(saved)).toContainEqual(
    expect.objectContaining({
      status: "warning",
      code: "ductEnvelope",
    }),
  );
  expect(validateProject(saved)).toContainEqual(
    expect.objectContaining({ code: "ductBendRadius", status: "invalid" }),
  );
});

it("rejects two terminals or a plenum that is not connected", () => {
  const p = fixture();
  const terminal = p.airTerminals[0];
  const plenum = p.plenums.find((item) => item.attachmentId === terminal.id)!;
  expect(() => createDuctFromEndpoints(p, plenum.id, terminal.id)).toThrow(
    /due bocchette/,
  );
  const free = insertPlenum(p, p.rooms[0].id, { x: 4, y: 4 });
  expect(() =>
    createDuctFromEndpoints(free, free.plenums.at(-1)!.id, terminal.id),
  ).toThrow(/macchina/);
});

it("moves a bend in plan without changing its elevation or the other points", () => {
  const p = fixture();
  const result = addDuctWaypoint(p, p.ducts![0].id);
  const duct = result.project.ducts![0];
  const before = structuredClone(duct.waypoints);
  const point = before[result.index];
  const moved = moveDuctWaypoint(result.project, duct.id, result.index, {
    x: point.x + 0.5,
    y: point.y - 0.3,
  });
  expect(moved.ducts![0].waypoints).toEqual(
    before.map((waypoint, i) =>
      i === result.index
        ? { ...point, x: point.x + 0.5, y: point.y - 0.3 }
        : waypoint,
    ),
  );
  expect(duct.waypoints).toEqual(before);
  duct.locked = true;
  expect(
    moveDuctWaypoint(result.project, duct.id, result.index, { x: 5, y: 5 })
      .ducts![0],
  ).toEqual(duct);
});

it("adds a bend using the plan projection and interpolates the existing elevation", () => {
  const p = fixture();
  const duct = p.ducts![0];
  duct.routing = "manual";
  duct.waypoints = [
    { x: 5, y: 3, elevationM: 1 },
    { x: 7, y: 3, elevationM: 3 },
  ];
  const result = addDuctWaypoint(p, duct.id, { x: 6, y: 3 });
  expect(result.project.ducts![0].waypoints[result.index]).toEqual({
    x: 6,
    y: 3,
    elevationM: 2,
  });
});
