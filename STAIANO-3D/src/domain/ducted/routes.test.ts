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
  plenumConnectionSide,
  syncAttachedPlenums,
  attachedPlenumPorts,
  plenumPortLocal,
  ATTACHED_PLENUM_COLLAR_LENGTH_M,
} from "./attached-plenums";
import { machinePlenum, placeSupplyPlenum, placedPlenumGeometry } from "./placement";
import { flexibleDuctCurve } from "./flexible-curve";
import { Vector3 } from "three";
import {
  addDuctWaypoint,
  createDuctFromEndpoints,
  ductRoute,
  ductLength,
  moveDuctWaypoint,
  removeDuctWaypoint,
  setDuctKind,
  uncrossedPairs,
} from "./routes";
import { projectSchema } from "@/schemas/project";
import { movePlacedDevice } from "../geometry/move-device";
import { validateProject, resolveCheckTarget } from "../validation";
import { decodeProject, encodeProject } from "@/services/project/format";
import { ductAirVelocityMs } from "./airflow";

/** Bocchetta e macchina con i rispettivi plenum salvati, macchina posizionata in pianta. */
function fixture(mounting: "wall" | "ceiling" = "ceiling") {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
    x: 3,
    y: 3,
  });
  p = addGuidedTerminal(
    p,
    2000,
    mounting === "wall" ? "EDLH" : "EDLS",
    mounting,
  );
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  p = connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
  return placeSupplyPlenum(p, p.hvacSystems[0].id);
}

it("removes an OEM flexible-tube choice when converting the duct to rigid", () => {
  const p = fixture();
  const duct = p.ducts![0];
  p.ducts![0].flexibleProductId = "ecoclima-etf10";
  const rigid = setDuctKind(p, duct.id, "rigid");
  expect(rigid.ducts![0].flexibleProductId).toBeUndefined();
  expect(setDuctKind(rigid, duct.id, "flexible").ducts![0].kind).toBe(
    "flexible",
  );
});

it("checks OEM air speed independently of loss-table coverage and never splits an unknown branch flow", () => {
  const p = fixture();
  const duct = p.ducts!.find(
    (item) => item.terminalId === p.airTerminals[0].id,
  )!;
  duct.kind = "flexible";
  duct.shape = "circle";
  duct.diameterMm = 160;
  duct.flexibleProductId = "ecoclima-etf10";
  expect(resolveCheckTarget(p, duct.id)).toEqual({
    floorId: p.plenums.find((item) => item.id === duct.plenumId)!.floorId,
    selection: { kind: "device", id: duct.id },
  });
  const check = () =>
    validateProject(p).find(
      (item) => item.code === "ductAirVelocity" && item.entityId === duct.id,
    );
  p.airTerminals[0].requiredAirflowM3h = 2500;
  expect(ductAirVelocityMs(p, duct)).toBeCloseTo(34.5388, 3);
  expect(check()?.status).toBe("invalid");
  p.airTerminals[0].requiredAirflowM3h = 1000;
  expect(check()?.status).toBe("valid");
  p.ducts!.push({ ...duct, id: "second-branch" });
  expect(ductAirVelocityMs(p, duct)).toBeNull();
  expect(check()?.status).toBe("warning");
  duct.diameterMm = 100;
  expect(check()).toBeUndefined();
});

it("measures flexible centreline arcs instead of the longer control polygon, and rejects impossible lengths", () => {
  const points = [
    { x: 0, y: 0, elevationM: 2.5 },
    { x: 2, y: 0, elevationM: 2.5 },
    { x: 2, y: 2, elevationM: 2.5 },
  ];
  expect(ductLength(points, 160)).toBeCloseTo(4 - 0.64 + (Math.PI * 0.32) / 2);
  expect(ductLength(points)).toBe(4);
  expect(ductLength([], 160)).toBeNull();
  expect(
    ductLength(
      [
        { x: 0, y: 0, elevationM: 2 },
        { x: 0.1, y: 0, elevationM: 2 },
        { x: 0.1, y: 1, elevationM: 2 },
      ],
      160,
    ),
  ).toBeNull();
});

it("checks duct height against the local pitched roof, including after reload", () => {
  const p = fixture();
  const room = p.rooms[0];
  room.ceilingHeightM = null;
  room.roof = { ridgeWallId: room.wallIds[0], ridgeHeightM: 4 };
  const duct = p.ducts![0];
  duct.routing = "manual";
  duct.waypoints = [{ ...room.centroid, elevationM: 3.5 }];
  const envelopeWarning = (project: typeof p) =>
    validateProject(project).find(
      (check) => check.code === "ductEnvelope" && check.entityId === duct.id,
    );
  expect(ductRoute(p, duct).some((point) => point.elevationM === 3.5)).toBe(
    true,
  );
  expect(envelopeWarning(p)).toBeUndefined();
  expect(envelopeWarning(decodeProject(encodeProject(p)))).toBeUndefined();
  duct.waypoints[0].elevationM = 4.1;
  expect(envelopeWarning(p)?.status).toBe("warning");
});

it("does not describe the generic R=D rule as the selected OEM minimum", () => {
  const p = fixture();
  const duct = p.ducts![0];
  duct.diameterMm = 160;
  duct.flexibleProductId = "ecoclima-etf10";
  duct.routing = "manual";
  duct.waypoints = [
    { ...p.rooms[0].centroid, elevationM: 2 },
    { ...p.rooms[0].centroid, elevationM: 2.001 },
  ];
  const check = validateProject(p).find(
    (item) => item.code === "ductBendRadius" && item.entityId === duct.id,
  );
  expect(check).toBeDefined();
  expect(check!.message).toContain("raggio minimo di 96,00 mm");
  expect(check!.message).not.toContain("raggio almeno pari al diametro");
  duct.flexibleProductId = undefined;
  expect(
    validateProject(p).find(
      (item) => item.code === "ductBendRadius" && item.entityId === duct.id,
    )?.message,
  ).toContain("raggio minimo di 160,00 mm");
});

it.each(
  [0, Math.PI / 2, Math.PI].flatMap((rotation) =>
    (["rear", "front", "upper", "lower", "left", "right"] as const).map(
      (position) => ({
        rotation,
        position,
      }),
    ),
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
    const side = plenumConnectionSide(result.project, target);
    const outward =
      side === "top"
        ? new Vector3(0, 1, 0)
        : side === "bottom"
          ? new Vector3(0, -1, 0)
          : side === "left"
            ? new Vector3(
                -Math.cos(target.rotation),
                0,
                -Math.sin(target.rotation),
              )
            : side === "right"
              ? new Vector3(
                  Math.cos(target.rotation),
                  0,
                  Math.sin(target.rotation),
                )
              : side === "front"
                ? new Vector3(
                    -Math.sin(target.rotation),
                    0,
                    Math.cos(target.rotation),
                  )
                : new Vector3(
                    Math.sin(target.rotation),
                    0,
                    -Math.cos(target.rotation),
                  );
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

it.each([0, Math.PI / 2, Math.PI].flatMap((rotation) =>
  (["upper", "lower", "left", "right", "rear", "front"] as const).map((position) => ({ rotation, position })),
))("mates the hose exactly to both visible mouths: $position, rotation $rotation", ({ rotation, position }) => {
  let p = fixture();
  const terminal = p.airTerminals[0];
  p = { ...p, plenums: p.plenums.map((body) => body.attachmentId === terminal.id
    ? { ...body, status: "manual" as const, rotation, position: { x: 5, y: 3 }, connectionPosition: position }
    : { ...body, rotation }) };
  const result = createDuctFromEndpoints(p, terminal.id, p.hvacSystems[0].id);
  const source = machinePlenum(result.project, terminal.systemId!, "supply")!;
  const target = terminalPlenum(result.project, terminal)!;
  expect(target.position).toEqual({ x: 5, y: 3 });
  expect(target.rotation).toBeCloseTo(rotation);
  const side = plenumConnectionSide(result.project, target);
  const half = ATTACHED_PLENUM_COLLAR_LENGTH_M / 2;
  const centre = plenumPortLocal(target, side, 0, 1, half);
  const axis = new Vector3(...({ top: [0, 1, 0], bottom: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, 1], rear: [0, 0, -1] }[side] as [number, number, number]));
  const targetMouth = new Vector3(centre.x, centre.z, centre.y).addScaledVector(axis, half)
    .applyAxisAngle(new Vector3(0, 1, 0), -target.rotation)
    .add(new Vector3(target.position.x, target.elevationM!, target.position.y));
  const geometry = placedPlenumGeometry(result.project, source)!;
  const port = geometry.ports.find((port) => port.branch.terminalIds.includes(terminal.id))!;
  const sourceMouth = new Vector3(port.centerMm[0] / 1000, port.centerMm[1] / 1000,
    (port.centerMm[2] + port.collarLengthMm) / 1000 - source.depthMm / 2000)
    .applyAxisAngle(new Vector3(0, 1, 0), -source.rotation)
    .add(new Vector3(source.position.x, source.elevationM!, source.position.y));
  for (const id of result.ductIds) {
    const duct = result.project.ducts!.find((duct) => duct.id === id)!;
    const curve = flexibleDuctCurve(ductRoute(result.project, duct), duct.diameterMm!)!.curve;
    expect(curve.getPointAt(0).distanceTo(sourceMouth)).toBeLessThan(1e-7);
    expect(curve.getPointAt(1).distanceTo(targetMouth)).toBeLessThan(1e-7);
  }
  expect(result.ductIds.length).toBeGreaterThan(0);
});

it("uses a different side for each collar of the same plenum", () => {
  let p = fixture();
  p = {
    ...p,
    plenums: p.plenums.map((plenum) =>
      plenum.attachmentId === p.airTerminals[0].id
        ? {
            ...plenum,
            portCount: 2,
            connectionPositions: ["left", "right"] as ("left" | "right")[],
          }
        : plenum,
    ),
  };
  p = syncAttachedPlenums(p);
  const result = createDuctFromEndpoints(
    p,
    p.airTerminals[0].id,
    p.hvacSystems[0].id,
  );
  const tangents = result.ductIds.map((id) => {
    const duct = result.project.ducts!.find((item) => item.id === id)!;
    return flexibleDuctCurve(
      ductRoute(result.project, duct),
      duct.diameterMm!,
    )!.curve.getTangentAt(1);
  });
  expect(Math.abs(tangents[0].x)).toBeGreaterThan(0.99);
  expect(Math.abs(tangents[1].x)).toBeGreaterThan(0.99);
  expect(Math.sign(tangents[0].x)).toBe(-Math.sign(tangents[1].x));
});

it.each(["upper", "lower", "left", "right", "rear", "front"] as const)(
  "leaves a manually declared machine plenum through its %s collar",
  (connectionPosition) => {
    const p = fixture();
    const machine = p.hvacSystems[0].indoorUnits[0];
    delete p.hvacSystems[0].genericMachine!.dischargeConnection;
    const source = p.plenums.find((plenum) => !plenum.attachmentId)!;
    Object.assign(source, {
      attachmentId: machine.id,
      status: "manual",
      connectionPosition,
      portCount: 1,
      portDiameterMm: 160,
      rotation: Math.PI / 3,
    });
    const duct = { ...p.ducts![0], routing: "manual" as const, waypoints: [] };
    const route = ductRoute(p, duct);
    const start = attachedPlenumPorts(p, source)[0];
    expect(route[0]).toMatchObject({
      x: start.x,
      y: start.y,
      elevationM: start.elevationM,
    });
    const direction = new Vector3(
      route[1].x - start.x,
      route[1].elevationM - start.elevationM,
      route[1].y - start.y,
    ).normalize();
    const outward =
      connectionPosition === "upper"
        ? new Vector3(0, 1, 0)
        : connectionPosition === "lower"
          ? new Vector3(0, -1, 0)
          : connectionPosition === "left"
            ? new Vector3(
                -Math.cos(source.rotation),
                0,
                -Math.sin(source.rotation),
              )
            : connectionPosition === "right"
              ? new Vector3(
                  Math.cos(source.rotation),
                  0,
                  Math.sin(source.rotation),
                )
              : connectionPosition === "front"
                ? new Vector3(
                    -Math.sin(source.rotation),
                    0,
                    Math.cos(source.rotation),
                  )
                : new Vector3(
                    Math.sin(source.rotation),
                    0,
                    -Math.cos(source.rotation),
                  );
    expect(direction.dot(outward)).toBeGreaterThan(0.999);
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
  // Un plenum libero si riaggancia in verticale alla bocchetta: per ottenere il
  // fallimento automatico lo si lascia staccato e bloccato.
  p.plenums = p.plenums.map((item) =>
    item.id === plenum.id
      ? { ...item, elevationM: (terminal.elevationM ?? 2) + 0.6, locked: true }
      : item,
  );
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

it("pairs facing collars by position so left never joins right", () => {
  const at = (x: number, y: number) => ({ x, y, elevationM: 2.4 });
  const machine = [at(-0.1, 0), at(0.1, 0)];
  // Plenum girato di 180°: i suoi stacchi 0 e 1 sono scambiati in pianta.
  expect(uncrossedPairs(machine, [at(0.1, 2), at(-0.1, 2)])).toEqual([1, 0]);
  expect(uncrossedPairs(machine, [at(-0.1, 2), at(0.1, 2)])).toEqual([0, 1]);
  // Direzione obliqua (verso +x,+y): sinistra resta con sinistra.
  expect(uncrossedPairs(machine, [at(2.1, 2), at(1.9, 2)])).toEqual([1, 0]);
  expect(uncrossedPairs(machine, [at(0, 2)])).toEqual([0]);
});
