import { createProject, addRectangle } from "@/domain/project";
import { applyDuctedSystem } from "@/domain/ducted/apply";
import { applyAirTerminalSolution } from "@/domain/air-terminals/apply";
import { sizeAirTerminal } from "@/domain/air-terminals/size";
import { airTerminalCatalog } from "@/domain/catalogs/air-terminals";
import { radiatorProducts } from "@/domain/catalogs/radiators";
import { sizeRadiators } from "@/domain/radiators/size";
import { applyRadiatorSolution } from "@/domain/radiators/apply";
/** Real catalogue products and domain commands, also used for PDF visual QA. */
export function dossierFixture() {
  let p = createProject("Abitazione Staiano - verifica dossier");
  p = addRectangle(p, p.floors[0].id, {
    width: 4.2,
    length: 3.8,
    height: 2.7,
    name: "Soggiorno",
  });
  p = addRectangle(p, p.floors[0].id, {
    width: 3.6,
    length: 3.2,
    height: 2.8,
    name: "Camera matrimoniale",
  });
  const living = p.rooms.find((r) => r.name === "Soggiorno")!,
    bedroom = p.rooms.find((r) => r.name === "Camera matrimoniale")!;
  p = {
    ...p,
    rooms: p.rooms.map((r) =>
      r.id === living.id ? { ...r, supplyPoints: 2 } : r,
    ),
  };
  p = applyDuctedSystem(p, [living.id], "Mitsubishi Electric", null);
  const system = p.hvacSystems[0];
  for (const [code, use, points] of [
    ["EDLS", "supply", 2],
    ["EGQ", "return", 1],
  ] as const) {
    const family = airTerminalCatalog.families.find(
      (f) => f.familyCode === code,
    )!;
    const solution = sizeAirTerminal(
      system.airflowM3h!,
      points,
      family,
      use,
    )[0];
    if (!solution) throw new Error(`Fixture senza soluzione ${code}`);
    p = applyAirTerminalSolution(
      p,
      living.id,
      system.id,
      use,
      code,
      solution,
      "ceiling",
    );
  }
  const variant = radiatorProducts.find(
    (v) =>
      v.manufacturer === "Cordivari" && v.columns === 3 && v.heightMm === 600,
  )!;
  const solution = sizeRadiators(bedroom.designLoadW, [variant], 50, {
    manufacturer: "Cordivari",
    family: variant.family,
    numberOfRadiators: 2,
    maxWidthMm: 1600,
  })[0];
  if (!solution) throw new Error("Fixture senza soluzione radiatori");
  return applyRadiatorSolution(p, bedroom.id, solution, null);
}
