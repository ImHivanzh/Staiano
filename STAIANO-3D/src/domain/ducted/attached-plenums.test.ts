import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import {
  placeMachineOnPlan,
  connectTerminalOnPlan,
} from "./graphic-installation";
import {
  addTerminalPlenum,
  insertPlenum,
  connectPlenum,
  syncAttachedPlenums,
  terminalPlenum,
  attachedPlenumPorts,
} from "./attached-plenums";
import {
  machinePlenum,
  placedPlenumGeometry,
  placeSupplyPlenum,
  missingMachinePlenums,
} from "./placement";
import { validateProject } from "../validation";
import { movePlacedDevice } from "../geometry/move-device";
import { rotateDevice90 } from "../geometry/rotate-device";
import {
  airConnectionRoutes,
  ductRoute,
  plenumLocalToPlan,
  setDuctRoute,
} from "./routes";
import { projectSchema } from "@/schemas/project";
import { removeSelection } from "../geometry/selection";
import { recordOperatorChanges } from "../project-commands";
import { checkLockedObjects } from "../project-commands";
import { connectionSelection } from "@/configurator/viewer3d/connection-selection";
import { calculateEcoclimaBom } from "../air-terminals/commercial-bom";
import { flexibleDuctCurve } from "./flexible-curve";

function fixture(mounting: "ceiling" | "wall" = "ceiling") {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(
    p,
    1000,
    mounting === "wall" ? "EDLH" : "EDLS",
    mounting,
  );
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  return connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
}

it("retains machine geometry and saved hoses when the historic attachment is null", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  const source = p.plenums.find((pl) => pl.attachmentId === undefined)!;
  const expected = placedPlenumGeometry(p, source);
  expect(expected?.ports.length).toBeGreaterThan(0);
  const nullAttachment = { ...source, attachmentId: null };
  const loaded = projectSchema.parse({
    ...p,
    plenums: p.plenums.map((pl) => (pl.id === source.id ? nullAttachment : pl)),
  });
  expect(placedPlenumGeometry(loaded, nullAttachment)).toEqual(expected);
  expect(loaded.ducts!.length).toBeGreaterThan(0);
  for (const duct of loaded.ducts!)
    expect(
      flexibleDuctCurve(ductRoute(loaded, duct), duct.diameterMm!),
    ).not.toBeNull();
});

it("salva il percorso tracciato in pianta come tubi flessibili fra i due plenum", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 2000, "EDLH", "wall");
  const terminal = p.airTerminals[0];
  expect(p.plenums).toHaveLength(0);
  const points = [
    { x: 3.6, y: 3 },
    { x: 4.4, y: 3.8 },
  ];
  expect(() => setDuctRoute(p, terminal.id, points)).toThrow(
    /strumento Plenum/,
  );
  p = addTerminalPlenum(p, terminal.id);
  p = setDuctRoute(p, terminal.id, points);
  expect(projectSchema.safeParse(p).success).toBe(true);
  const plenum = p.plenums.find((pl) => pl.attachmentId === terminal.id)!;
  expect(plenum).toBeDefined();
  expect(p.airTerminals.find((item) => item.id === terminal.id)!.plenumId).toBe(
    plenum.id,
  );
  // Una bocchetta a due stacchi: un tubo per stacco, non un disegno unico.
  expect(p.ducts).toHaveLength(plenum.portCount!);
  for (const duct of p.ducts!) {
    expect(duct.kind).toBe("flexible");
    expect(duct.routing).toBe("manual");
    expect(duct.waypoints).toHaveLength(points.length);
    expect(ductRoute(p, duct).length).toBeGreaterThanOrEqual(2);
  }
});

it("saves a separate terminal plenum, its real port count and flexible 3D routes", () => {
  const p = fixture();
  expect(projectSchema.safeParse(p).success).toBe(true);
  const plenum = p.plenums[0];
  expect(plenum.attachmentId).toBe(p.airTerminals[0].id);
  expect(p.ducts).toHaveLength(plenum.portCount!);
  for (const duct of p.ducts!) {
    expect(duct.kind).toBe("flexible");
    expect(ductRoute(p, duct).length).toBeGreaterThanOrEqual(2);
    const start = ductRoute(p, duct)[0],
      machine = p.hvacSystems[0].indoorUnits[0];
    expect(
      (start.y - machine.position.y) * Math.cos(machine.rotation) -
        (start.x - machine.position.x) * Math.sin(machine.rotation),
    ).toBeGreaterThan(machine.depthMm / 2000);
    expect(ductRoute(p, duct).at(-1)!.elevationM).toBeGreaterThan(
      p.airTerminals[0].elevationM!,
    );
  }
  const edited = {
    ...p,
    ducts: p.ducts!.map((d) => ({
      ...d,
      routing: "manual" as const,
      waypoints: [{ x: 3, y: 2, elevationM: 2.5 }],
    })),
  };
  expect(ductRoute(edited, edited.ducts[0])).toContainEqual({
    x: 3,
    y: 2,
    elevationM: 2.5,
  });
});

it("follows the terminal while proposed, then keeps its offset and follows the terminal, cascading deletion", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
    x: 3,
    y: 3,
  });
  p = addGuidedTerminal(p, 1000);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  const id = p.airTerminals[0].id;
  const plenumId = p.plenums[0].id;
  expect(p.plenums[0].status).toBe("proposed");
  const following = syncAttachedPlenums(
    movePlacedDevice(p, id, { x: 4, y: 3 }),
    p,
  );
  // Il plenum segue la bocchetta conservando il distacco di catalogo.
  const offset = (state: typeof p) => ({
    x: state.plenums[0].position.x - state.airTerminals[0].position.x,
    y: state.plenums[0].position.y - state.airTerminals[0].position.y,
  });
  expect(offset(following)).toEqual(offset(p));
  // Trascinare il plenum agganciato sposta anche la bocchetta: restano uniti.
  const placed = syncAttachedPlenums(
    movePlacedDevice(following, plenumId, { x: 5, y: 4 }),
    following,
  );
  expect(placed.plenums[0].position).toEqual({ x: 5, y: 4 });
  expect(offset(placed)).toEqual(offset(following));
  const ownerMoved = syncAttachedPlenums(
    movePlacedDevice(placed, id, { x: 4.5, y: 2.5 }),
    placed,
  );
  expect(offset(ownerMoved)).toEqual(offset(placed));
  const rotated = rotateDevice90(ownerMoved, plenumId);
  expect(rotated.plenums[0].rotation).toBeCloseTo(
    ownerMoved.plenums[0].rotation + Math.PI / 2,
  );
  const deleted = syncAttachedPlenums(
    removeSelection(rotated, [{ kind: "device", id }]),
  );
  expect(deleted.plenums).toHaveLength(0);
  expect(deleted.ducts).toHaveLength(0);
});

it("eliminando il plenum della macchina spariscono i flessibili del suo lato", () => {
  let p = fixture();
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  const machine = p.plenums.find(
    (pl) =>
      pl.systemId === p.hvacSystems[0].id &&
      !p.airTerminals.some((t) => t.id === pl.attachmentId),
  )!;
  const ductIds = p.ducts!.map((d) => d.id);
  expect(ductIds.length).toBeGreaterThan(0);
  const deleted = removeSelection(p, [{ kind: "device", id: machine.id }]);
  // Il commit dello store risincronizza dopo la cancellazione.
  const next = syncAttachedPlenums(deleted, p);
  expect(next.plenums.some((pl) => pl.id === machine.id)).toBe(false);
  expect(next.ducts!.filter((d) => ductIds.includes(d.id))).toHaveLength(0);
  expect(next.ducts!.filter((d) => d.terminalId)).toHaveLength(0);
});

it("keeps the terminal plenum when reconnecting and supports a return plenum on the machine", () => {
  let p = fixture();
  const terminal = p.airTerminals[0];
  p = syncAttachedPlenums(
    connectTerminalOnPlan(p, terminal.id, p.hvacSystems[0].id),
  );
  expect(p.airTerminals[0].plenumId).toBe(p.plenums[0].id);
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  const id = p.plenums.at(-1)!.id;
  p = {
    ...p,
    plenums: p.plenums.map((pl) =>
      pl.id === id ? { ...pl, use: "return" as const } : pl,
    ),
  };
  p = connectPlenum(p, id, p.hvacSystems[0].indoorUnits[0].id);
  const plenum = p.plenums.find((pl) => pl.id === id)!;
  expect(plenum.use).toBe("return");
  expect(plenum.widthMm).toBe(p.hvacSystems[0].indoorUnits[0].widthMm);
  expect(plenum.heightMm).toBe(p.hvacSystems[0].indoorUnits[0].heightMm);
  // Secondo lato: un altro plenum della stessa macchina prende la mandata.
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 1 });
  const supplyId = p.plenums.at(-1)!.id;
  p = connectPlenum(p, supplyId, p.hvacSystems[0].indoorUnits[0].id);
  expect(
    p.plenums
      .filter(
        (pl) =>
          pl.attachmentId &&
          pl.attachmentId === p.hvacSystems[0].indoorUnits[0].id,
      )
      .map((pl) => pl.use)
      .sort(),
  ).toEqual(["return", "supply"]);
  const moved = rotateDevice90(p, p.hvacSystems[0].indoorUnits[0].id);
  // Il plenum collegato alla macchina ruota con lei, conservando il distacco.
  expect(moved.plenums.find((pl) => pl.id === id)!.rotation).toBeCloseTo(
    plenum.rotation + Math.PI / 2,
  );
  expect(projectSchema.safeParse(moved).success).toBe(true);
  // Spostare il plenum della macchina trascina la macchina: restano uniti.
  const relocated = syncAttachedPlenums(
    movePlacedDevice(moved, id, { x: 4, y: 4 }),
    moved,
  );
  const unit = relocated.hvacSystems[0].indoorUnits[0];
  const before = moved.hvacSystems[0].indoorUnits[0];
  const relocatedPlenum = relocated.plenums.find((pl) => pl.id === id)!;
  expect(relocatedPlenum.position.x).toBeCloseTo(4);
  expect(relocatedPlenum.position.y).toBeCloseTo(4);
  expect(unit.position).not.toEqual(before.position);
  expect(recordOperatorChanges(p, moved).ducts!.length).toBeGreaterThan(0);
});

it("wall terminals snap and rotate onto perpendicular walls even with fine snapping disabled", () => {
  const p = fixture("wall");
  const terminal = p.airTerminals[0];
  const snap = {
    enabled: true,
    grid: false,
    stepM: 0.1,
    toleranceM: 0.12,
    orthogonal: false,
    angle45: false,
    parallel: false,
  };
  const first = syncAttachedPlenums(
    movePlacedDevice(p, terminal.id, { x: 4, y: 0.3 }, snap),
    p,
  );
  const second = syncAttachedPlenums(
    movePlacedDevice(
      first,
      terminal.id,
      { x: 7.7, y: 3 },
      { ...snap, enabled: false },
    ),
    first,
  );
  expect(second.airTerminals[0].wallId).not.toBe(first.airTerminals[0].wallId);
  expect(
    Math.abs(
      Math.sin(
        second.airTerminals[0].rotation - first.airTerminals[0].rotation,
      ),
    ),
  ).toBeCloseTo(1);
  // Il plenum è agganciato: conserva il distacco dalla bocchetta e ruota con lei.
  const before = {
    x: p.plenums[0].position.x - p.airTerminals[0].position.x,
    y: p.plenums[0].position.y - p.airTerminals[0].position.y,
  };
  const turned = second.airTerminals[0].rotation - p.airTerminals[0].rotation;
  const expected = {
    x: before.x * Math.cos(turned) - before.y * Math.sin(turned),
    y: before.x * Math.sin(turned) + before.y * Math.cos(turned),
  };
  expect(
    second.plenums[0].position.x - second.airTerminals[0].position.x,
  ).toBeCloseTo(expected.x, 6);
  expect(
    second.plenums[0].position.y - second.airTerminals[0].position.y,
  ).toBeCloseTo(expected.y, 6);
  expect(second.plenums[0].rotation).toBeCloseTo(
    p.plenums[0].rotation + turned,
    6,
  );
  expect(projectSchema.safeParse(second).success).toBe(true);
});

it("rotating a machine plenum rotates the machine so body, text and ports stay aligned", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  const machine = p.hvacSystems[0].indoorUnits[0];
  const plenum = p.plenums[0];
  expect(plenum.attachmentId).toBeUndefined();
  const rotated = rotateDevice90(p, plenum.id);
  const turnedMachine = rotated.hvacSystems[0].indoorUnits[0];
  expect(turnedMachine.rotation).toBeCloseTo(machine.rotation + Math.PI / 2);
  expect(rotated.plenums[0].rotation).toBeCloseTo(
    plenum.rotation + Math.PI / 2,
  );
  // Il plenum resta davanti alla macchina, alla stessa distanza.
  const offset = (item: typeof plenum, unit: typeof machine) => ({
    x: item.position.x - unit.position.x,
    y: item.position.y - unit.position.y,
  });
  const before = offset(plenum, machine),
    after = offset(rotated.plenums[0], turnedMachine);
  expect(Math.hypot(after.x, after.y)).toBeCloseTo(
    Math.hypot(before.x, before.y),
  );
  expect(Math.atan2(after.y, after.x)).toBeCloseTo(
    Math.atan2(before.y, before.x) + Math.PI / 2,
  );
  expect(projectSchema.safeParse(rotated).success).toBe(true);
  expect(() =>
    rotateDevice90(
      { ...p, plenums: p.plenums.map((pl) => ({ ...pl, locked: true })) },
      plenum.id,
    ),
  ).toThrow(/Sblocca il plenum/);
});

it("pairs plenum connections in both orders, blocks locked plenum motion and counts the saved plenum once", () => {
  const p = fixture();
  const plenum = p.plenums[0],
    terminal = p.airTerminals[0];
  expect(connectionSelection(p, plenum.id, terminal.id)?.plenumId).toBe(
    plenum.id,
  );
  expect(connectionSelection(p, terminal.id, plenum.id)?.plenumId).toBe(
    plenum.id,
  );
  const locked = { ...p, plenums: [{ ...plenum, locked: true }] };
  expect(() => movePlacedDevice(locked, plenum.id, { x: 4, y: 3 })).toThrow(
    /Sbloccare l’elemento/,
  );
  expect(() =>
    checkLockedObjects(locked, {
      ...locked,
      plenums: [{ ...locked.plenums[0], position: { x: 4, y: 3 } }],
    }),
  ).toThrow(/bloccato/);
  const bom = calculateEcoclimaBom(p);
  // Corpo separato con misure libere: una sola riga, da quotare.
  const plenumLines = bom.lines.filter(
    (line) => line.kind === "insulated-plenum",
  );
  expect(plenumLines).toHaveLength(1);
  expect(plenumLines[0]).toMatchObject({
    id: `${plenum.id}:plenum`,
    status: "unknown",
  });
});

it.each([0, Math.PI / 2, Math.PI])(
  "connects each catalogue collar between the two visible plenums at rotation %s without rewriting the project",
  (rotation) => {
    let p = guidedProjectFixture();
    p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
      x: 3,
      y: 3,
    });
    p = addGuidedTerminal(p, 1000);
    p = addTerminalPlenum(p, p.airTerminals[0].id);
    // Qui si provano i percorsi proposti: i flessibili salvati non contano.
    p = { ...p, ducts: [] };
    p.hvacSystems[0].indoorUnits[0].rotation = rotation;
    const before = JSON.stringify(p);
    const terminal = p.airTerminals[0];
    const body = terminalPlenum(p, terminal)!;
    const source = machinePlenum(p, terminal.systemId!, "supply")!;
    const ports = placedPlenumGeometry(p, source)!.ports.filter((port) =>
      port.branch.terminalIds.includes(terminal.id),
    );
    const connections = airConnectionRoutes(p, p.floors[0].id);
    expect(connections).toHaveLength(body.portCount!);
    for (const [index, connection] of connections.entries()) {
      expect(
        flexibleDuctCurve(connection.points, connection.diameterMm),
      ).not.toBeNull();
      const port = ports[index];
      expect(connection.points[0]).toEqual(
        plenumLocalToPlan(source, [
          port.centerMm[0] / 1000,
          port.centerMm[1] / 1000,
          (port.centerMm[2] + port.collarLengthMm) / 1000,
        ]),
      );
      const { diameterMm: diameter, ...end } = attachedPlenumPorts(p, body)[
        index
      ];
      expect(connection.points.at(-1)).toMatchObject(end);
      expect(connection.diameterMm).toBe(diameter);
      const [start, lead] = connection.points;
      expect(
        (lead.y - start.y) * Math.cos(source.rotation) -
          (lead.x - start.x) * Math.sin(source.rotation),
      ).toBeGreaterThan(0);
    }
    expect(JSON.stringify(p)).toBe(before);
    const moved = movePlacedDevice(p, terminal.id, { x: 5, y: 3 });
    const next = airConnectionRoutes(moved, p.floors[0].id);
    expect(next[0].points[0]).toEqual(connections[0].points[0]);
    expect(next[0].points.at(-1)).not.toEqual(connections[0].points.at(-1));
  },
);

it("does not invent a terminal plenum: only the saved connected body exists", () => {
  const p = fixture();
  p.plenums = [];
  p.ducts = [];
  const terminal = p.airTerminals[0];
  terminal.plenumId = null;
  expect(terminalPlenum(p, terminal)).toBeNull();
  expect(airConnectionRoutes(p, p.floors[0].id)).toEqual([]);
  terminal.catalogVersion = "missing";
  expect(terminalPlenum(p, terminal)).toBeNull();
  expect(() => addTerminalPlenum(p, terminal.id)).toThrow(/catalogo/);
});

it.each([
  ["rear", 0, -0.16, 0],
  ["front", 0, 0.16, 0],
  ["upper", 0, 0, 0.21],
  ["lower", 0, 0, -0.21],
  ["left", -0.36, 0, 0],
  ["right", 0.36, 0, 0],
] as const)(
  "places the %s collar on the chosen side of the plenum",
  (side, dx, dy, dz) => {
    const p = fixture();
    for (const rotation of [0, Math.PI / 2, 0.7])
      for (const elevationM of [1.7, 2.5]) {
        const plenum = {
          ...p.plenums[0],
          position: { x: 2, y: 2 },
          rotation,
          elevationM,
          widthMm: 600,
          depthMm: 200,
          heightMm: 300,
          portCount: 1,
          connectionPosition: side,
        };
        const [port] = attachedPlenumPorts(p, plenum);
        expect(port.x).toBeCloseTo(
          2 + dx * Math.cos(rotation) - dy * Math.sin(rotation),
        );
        expect(port.y).toBeCloseTo(
          2 + dx * Math.sin(rotation) + dy * Math.cos(rotation),
        );
        expect(port.elevationM).toBeCloseTo(elevationM + dz);
      }
  },
);

it("puts each flexible collar on its own side of the same plenum", () => {
  const p = fixture();
  const plenum = {
    ...p.plenums[0],
    position: { x: 2, y: 2 },
    rotation: 0,
    elevationM: 2,
    widthMm: 600,
    depthMm: 200,
    heightMm: 300,
    portCount: 2,
    connectionPositions: ["left", "right"] as ("left" | "right")[],
  };
  const [left, right] = attachedPlenumPorts(p, plenum);
  expect(left.x).toBeCloseTo(2 - 0.36);
  expect(left.y).toBeCloseTo(2);
  expect(right.x).toBeCloseTo(2 + 0.36);
  expect(right.y).toBeCloseTo(2);
});

it("turns a machine plenum together with its machine", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, {
    x: 3,
    y: 3,
  });
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  const machine = p.hvacSystems[0].indoorUnits[0];
  p = connectPlenum(p, p.plenums[0].id, machine.id);
  expect(p.plenums[0].attachmentId).toBe(machine.id);
  // Collegato, il plenum fitta sulla bocca: a contatto con la macchina, non dov'era.
  const gap = (machine.depthMm! + p.plenums[0].depthMm) / 2000;
  const distance = (plenum: (typeof p.plenums)[number], unit: typeof machine) =>
    Math.hypot(plenum.position.x - unit.position.x, plenum.position.y - unit.position.y);
  expect(distance(p.plenums[0], machine)).toBeCloseTo(gap);
  const turned = rotateDevice90(p, machine.id);
  const turnedMachine = turned.hvacSystems[0].indoorUnits[0];
  expect(turned.plenums[0].rotation).toBeCloseTo(p.plenums[0].rotation + Math.PI / 2);
  expect(distance(turned.plenums[0], turnedMachine)).toBeCloseTo(gap);
});

it("keeps the plenum inlet direction when the body is unconnected", () => {
  const p = fixture();
  const plenum = {
    ...p.plenums[0],
    attachmentId: null,
    connectionPosition: "upper" as const,
  };
  for (const port of attachedPlenumPorts(p, plenum)) {
    expect(port.elevationM).toBeCloseTo(
      (plenum.elevationM ?? 2) + plenum.heightMm / 2000 + 0.06,
    );
  }
});

it("places the machine plenum beside an existing terminal plenum and aligns it with the machine above a suspended ceiling", () => {
  let p = fixture();
  const attached = p.plenums[0];
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  expect(p.plenums).toHaveLength(2);
  expect(p.airTerminals[0].plenumId).toBe(attached.id);
  const source = machinePlenum(p, p.hvacSystems[0].id, "supply")!;
  const machine = p.hvacSystems[0].indoorUnits[0];
  expect(source.elevationM).toBeCloseTo(
    p.rooms[0].heightM - machine.heightMm / 2000 - 0.05,
  );
  expect(placeSupplyPlenum(p, p.hvacSystems[0].id).plenums).toHaveLength(2);
});

it("riaggancia in verticale il plenum staccato dalla bocchetta a parete", () => {
  const p = fixture("wall");
  const terminal = p.airTerminals[0];
  const detached = {
    ...p,
    plenums: p.plenums.map((item) => ({
      ...item,
      status: "manual" as const,
      elevationM: (terminal.elevationM ?? 2) - 0.5,
    })),
  };
  const healed = syncAttachedPlenums(detached, detached);
  expect(healed.plenums[0].elevationM).toBe(terminal.elevationM);
  // Un piccolo distacco scelto, ancora a contatto, resta com'è.
  const near = {
    ...detached,
    plenums: detached.plenums.map((item) => ({
      ...item,
      elevationM: (terminal.elevationM ?? 2) - 0.05,
    })),
  };
  expect(syncAttachedPlenums(near, near).plenums[0].elevationM).toBeCloseTo(
    (terminal.elevationM ?? 2) - 0.05,
  );
});

it("segnala il plenum macchina mancante e lo toglie quando viene creato", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  const system = p.hvacSystems[0];
  expect(missingMachinePlenums(p, system.id)).toEqual(["supply"]);
  expect(
    validateProject(p).some((check) => check.code === "machinePlenumMissing"),
  ).toBe(true);
  const placed = placeSupplyPlenum(p, system.id);
  expect(missingMachinePlenums(placed, system.id)).toEqual([]);
});
