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
  insertPlenum,
  connectPlenum,
  syncAttachedPlenums,
} from "./attached-plenums";
import { placeSupplyPlenum } from "./placement";
import { movePlacedDevice } from "../geometry/move-device";
import { rotateDevice90 } from "../geometry/rotate-device";
import { ductRoute } from "./routes";
import { projectSchema } from "@/schemas/project";
import { removeSelection } from "../geometry/selection";
import { recordOperatorChanges } from "../project-commands";
import { checkLockedObjects } from "../project-commands";
import { connectionSelection } from "@/configurator/viewer3d/connection-selection";
import { calculateEcoclimaBom } from "../air-terminals/commercial-bom";

function fixture(mounting: "ceiling" | "wall" = "ceiling") {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000, "EDLS", mounting);
  p = insertPlenum(p, p.rooms[0].id, { x: 2, y: 2 });
  return connectPlenum(p, p.plenums[0].id, p.airTerminals[0].id);
}

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
    ).toBeCloseTo(machine.depthMm / 2000);
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
  expect(ductRoute(edited, edited.ducts[0])[1]).toEqual({
    x: 3,
    y: 2,
    elevationM: 2.5,
  });
});

it("moves and rotates attachments with their owner and cascades deletion", () => {
  const p = fixture();
  const id = p.airTerminals[0].id;
  let moved = syncAttachedPlenums(movePlacedDevice(p, id, { x: 4, y: 3 }));
  expect(moved.plenums[0].position).toEqual(moved.airTerminals[0].position);
  moved = rotateDevice90(moved, id);
  expect(moved.plenums[0].rotation).toBeCloseTo(moved.airTerminals[0].rotation);
  expect(moved.plenums[0].rotation).toBeCloseTo(
    p.airTerminals[0].rotation + Math.PI / 2,
  );
  const deleted = syncAttachedPlenums(
    removeSelection(moved, [{ kind: "device", id }]),
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
  p = connectPlenum(p, id, p.hvacSystems[0].indoorUnits[0].id);
  const plenum = p.plenums.find((pl) => pl.id === id)!;
  expect(plenum.use).toBe("return");
  expect(plenum.widthMm).toBe(p.hvacSystems[0].indoorUnits[0].widthMm);
  expect(plenum.heightMm).toBe(p.hvacSystems[0].indoorUnits[0].heightMm);
  const moved = rotateDevice90(p, p.hvacSystems[0].indoorUnits[0].id);
  expect(moved.plenums.find((pl) => pl.id === id)!.rotation).toBeCloseTo(
    plenum.rotation + Math.PI / 2,
  );
  expect(projectSchema.safeParse(moved).success).toBe(true);
  expect(() => movePlacedDevice(moved, id, { x: 4, y: 4 })).toThrow(/segue/);
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
  expect(second.plenums[0].rotation).toBeCloseTo(
    second.airTerminals[0].rotation,
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

it("pairs plenum connections in both orders, prevents locked attachment motion and counts the saved plenum once", () => {
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
    checkLockedObjects(
      locked,
      syncAttachedPlenums(
        movePlacedDevice(locked, terminal.id, { x: 4, y: 3 }),
      ),
    ),
  ).toThrow(/bloccato/);
  const bom = calculateEcoclimaBom(p);
  expect(bom.lines.filter((line) => /plenum/.test(line.kind))).toHaveLength(1);
  expect(bom.lines.find((line) => /plenum/.test(line.kind))?.id).toBe(
    `${plenum.id}:plenum`,
  );
});
