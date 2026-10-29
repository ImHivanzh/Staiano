import { expect, it } from "vitest";
import {
  guidedProjectFixture,
  addGuidedTerminal,
} from "../../../tests/guided-fixture";
import { placeMachineOnPlan } from "./graphic-installation";
import { addTerminalPlenum, attachedPlenumPorts } from "./attached-plenums";
import { movePlacedDevice } from "../geometry/move-device";
import { ductRoute } from "./routes";
import { flexibleDuctCurve } from "./flexible-curve";
import { wallCavityPolygon } from "./wall-cavity";
import { decodeProject, encodeProject } from "@/services/project/format";
import { validateProject } from "../validation";
import { setWallDrywall } from "../geometry/drywall";

function fixture() {
  let p = guidedProjectFixture();
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 2000, "EDLH", "wall");
  p = movePlacedDevice(
    p,
    p.airTerminals[0].id,
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
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  return p;
}

it("allows two separate hoses behind the declared wall, with real bend radii and round-trip persistence", () => {
  let p = fixture();
  p.plenums[0].connectionPositions = ["rear", "rear"];
  expect(p.ducts).toHaveLength(2);
  expect(p.ducts!.every((d) => ductRoute(p, d).length === 0)).toBe(true);
  p = setWallDrywall(p, p.airTerminals[0].wallId!, {
    roomId: p.rooms[0].id,
    offsetM: -0.8,
  });
  p = decodeProject(encodeProject(p));
  expect(
    p.walls.find((w) => w.id === p.airTerminals[0].wallId)!.drywall!.offsetM,
  ).toBe(-0.8);
  expect(wallCavityPolygon(p, p.airTerminals[0])).toHaveLength(4);
  for (const duct of p.ducts!)
    expect(
      flexibleDuctCurve(ductRoute(p, duct), duct.diameterMm!),
    ).not.toBeNull();
  expect(validateProject(p).filter((c) => c.code === "ductEnvelope")).toEqual(
    [],
  );
  expect(ductRoute(p, p.ducts![0]).at(-1)).not.toEqual(
    ductRoute(p, p.ducts![1]).at(-1),
  );
});

it("does not silently enlarge an insufficient cavity", () => {
  let p = fixture();
  p = setWallDrywall(p, p.airTerminals[0].wallId!, {
    roomId: p.rooms[0].id,
    offsetM: -0.05,
  });
  expect(p.ducts!.every((d) => ductRoute(p, d).length === 0)).toBe(true);
});

it("supports actual upper collars on a wall plenum in a shallower cavity", () => {
  let p = fixture();
  p = setWallDrywall(p, p.airTerminals[0].wallId!, {
    roomId: p.rooms[0].id,
    offsetM: -0.3,
  });
  p.plenums[0].connectionPositions = ["upper", "upper"];
  const ends = attachedPlenumPorts(p, p.plenums[0]);
  expect(ends[0].elevationM).toBeGreaterThan(p.plenums[0].elevationM!);
  for (const duct of p.ducts!)
    expect(
      flexibleDuctCurve(ductRoute(p, duct), duct.diameterMm!),
    ).not.toBeNull();
});

it("does not extend the floor for ceiling terminals or an unassociated wall", () => {
  const p = fixture();
  const t = p.airTerminals[0];
  p.walls.find((w) => w.id === t.wallId)!.drywall = {
    roomId: p.rooms[0].id,
    offsetM: -0.5,
  };
  t.wallId = null;
  expect(wallCavityPolygon(p, t)).toBeNull();
  t.mounting = "ceiling";
  expect(wallCavityPolygon(p, t)).toBeNull();
});

it("a wall plenum faces the grille with the catalogue footprint and goes P deep behind it", () => {
  const p = fixture();
  const [t] = p.airTerminals;
  const [pl] = p.plenums;
  expect(pl.widthMm).toBe(2000);
  expect(pl.heightMm).toBe(65);
  expect(pl.depthMm).toBe(240);
  expect(pl.heightMm).toBeLessThanOrEqual(t.heightMm + 10);
});
