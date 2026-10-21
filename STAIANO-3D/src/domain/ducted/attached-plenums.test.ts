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
} from "./placement";
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
  p = addGuidedTerminal(p, 1000, "EDLS", mounting);
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  return connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
}

it("salva il percorso tracciato in pianta come tubi flessibili fra i due plenum", () => {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 2000, "EDLS", "wall");
  const terminal = p.airTerminals[0];
  expect(p.plenums).toHaveLength(0);
  const points = [
    { x: 3.6, y: 3 },
    { x: 4.4, y: 3.8 },
  ];
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

it("follows the terminal while proposed, then moves and rotates independently and cascades deletion", () => {
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
  const following = syncAttachedPlenums(movePlacedDevice(p, id, { x: 4, y: 3 }));
  expect(following.plenums[0].position).toEqual(
    following.airTerminals[0].position,
  );
  // L'operatore sposta il plenum: diventa autonomo e la bocchetta non lo trascina.
  const placed = movePlacedDevice(following, plenumId, { x: 5, y: 4 });
  expect(placed.plenums[0].status).toBe("manual");
  const ownerMoved = syncAttachedPlenums(
    movePlacedDevice(placed, id, { x: 4.5, y: 2.5 }),
  );
  expect(ownerMoved.plenums[0].position).toEqual({ x: 5, y: 4 });
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
  // Il plenum già posizionato non segue più la macchina: ruota da solo.
  expect(moved.plenums.find((pl) => pl.id === id)!.rotation).toBeCloseTo(
    plenum.rotation,
  );
  expect(projectSchema.safeParse(moved).success).toBe(true);
  const relocated = movePlacedDevice(moved, id, { x: 4, y: 4 });
  expect(relocated.plenums.find((pl) => pl.id === id)!.position).toEqual({
    x: 4,
    y: 4,
  });
  expect(relocated.plenums.find((pl) => pl.id === id)!.status).toBe("manual");
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
  );
  const second = syncAttachedPlenums(
    movePlacedDevice(
      first,
      terminal.id,
      { x: 7.7, y: 3 },
      { ...snap, enabled: false },
    ),
  );
  expect(second.airTerminals[0].wallId).not.toBe(first.airTerminals[0].wallId);
  expect(
    Math.abs(
      Math.sin(
        second.airTerminals[0].rotation - first.airTerminals[0].rotation,
      ),
    ),
  ).toBeCloseTo(1);
  // Il plenum salvato resta nella posa scelta: non segue la nuova parete.
  expect(second.plenums[0].rotation).toBeCloseTo(p.plenums[0].rotation);
  expect(second.plenums[0].position).toEqual(p.plenums[0].position);
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
  expect(() =>
    movePlacedDevice(locked, plenum.id, { x: 4, y: 3 }),
  ).toThrow(/Sbloccare l’elemento/);
  expect(() =>
    checkLockedObjects(locked, {
      ...locked,
      plenums: [{ ...locked.plenums[0], position: { x: 4, y: 3 } }],
    }),
  ).toThrow(/bloccato/);
  const bom = calculateEcoclimaBom(p);
  // Un plenum con le quote di catalogo resta una sola riga, quotata dal listino.
  expect(
    bom.lines.filter((line) => line.kind === "insulated-plenum"),
  ).toHaveLength(1);
  expect(bom.lines.some((line) => line.id === `${plenum.id}:plenum`)).toBe(
    false,
  );
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

it("does not invent a terminal plenum when it was excluded or its catalogue dimensions are unknown", () => {
  const p = fixture();
  p.plenums = [];
  p.ducts = [];
  const terminal = p.airTerminals[0];
  terminal.commercialOptions = {
    ...terminal.commercialOptions!,
    insulatedPlenum: false,
  };
  expect(terminalPlenum(p, terminal)).toBeNull();
  expect(airConnectionRoutes(p, p.floors[0].id)).toEqual([]);
  terminal.commercialOptions.insulatedPlenum = true;
  terminal.catalogVersion = "missing";
  expect(terminalPlenum(p, terminal)).toBeNull();
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
