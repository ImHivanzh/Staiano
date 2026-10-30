import { expect, it } from "vitest";
import { validateProject } from "../validation";
import { addTerminalPlenum } from "./attached-plenums";
import { ductScenePaths } from "./collisions";
import { fixDuctRoute } from "./fix-route";
import { placeMachineOnPlan } from "./graphic-installation";
import { placeSupplyPlenum } from "./placement";
import { createDuctFromEndpoints } from "./routes";
import {
  addGuidedTerminal,
  guidedProjectFixture,
} from "../../../tests/guided-fixture";

/** Canale flessibile con un pilastro alto proprio a metà percorso. */
function blockedProject() {
  let p = guidedProjectFixture();
  p.rooms[0].heightM = 4;
  p.rooms[0].ceilingHeightM = 2.4;
  p = placeMachineOnPlan(p, p.hvacSystems[0].id, p.rooms[0].id, { x: 3, y: 3 });
  p = addGuidedTerminal(p, 1000);
  p = placeSupplyPlenum(p, p.hvacSystems[0].id);
  p = addTerminalPlenum(p, p.airTerminals[0].id);
  p = createDuctFromEndpoints(
    p,
    p.airTerminals[0].id,
    p.hvacSystems[0].id,
  ).project;
  const path = ductScenePaths(p).find((item) => item.flexible)!;
  // Metà del tratto lungo, lontano dagli attacchi.
  const [a, b] = [path.points[3], path.points[4]];
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  p.pillars = [
    {
      id: "obstacle",
      floorId: path.floorId,
      position: middle,
      widthMm: 600,
      depthMm: 600,
      heightMm: 4000,
      rotation: 0,
      locked: false,
    },
  ];
  return { project: p, ductId: path.id };
}

const count = (
  project: ReturnType<typeof blockedProject>["project"],
  id: string,
) =>
  validateProject(project).filter(
    (check) => check.status !== "valid" && check.entityId === id,
  ).length;

it("fixDuctRoute non peggiora mai e conta i problemi prima e dopo", () => {
  const { project, ductId } = blockedProject();
  expect(count(project, ductId)).toBeGreaterThan(0);
  const fix = fixDuctRoute(project, ductId);
  expect(fix.before).toBe(count(project, ductId));
  expect(fix.after).toBeLessThan(fix.before);
  expect(count(fix.project, ductId)).toBe(fix.after);
});

it("fixDuctRoute rifiuta un canale bloccato", () => {
  const { project, ductId } = blockedProject();
  const locked = {
    ...project,
    ducts: project.ducts!.map((d) =>
      d.id === ductId ? { ...d, locked: true } : d,
    ),
  };
  expect(() => fixDuctRoute(locked, ductId)).toThrow(/Sblocca/);
});
