import type { Project } from "@/schemas/project";

/** Stable within a project snapshot, independent of the selected floor. */
export function deviceCodes(project: Project): Map<string, string> {
  const codes = new Map<string, string>();
  project.radiators.forEach((d, i) => codes.set(d.id, `RAD${i + 1}`));
  project.fanCoils?.forEach((d, i) => codes.set(d.id, `FC${i + 1}`));
  let supply = 0,
    returning = 0,
    indoor = 0;
  project.airTerminals.forEach((d) =>
    codes.set(d.id, d.use === "supply" ? `M${++supply}` : `R${++returning}`),
  );
  project.hvacSystems.forEach((s, i) => {
    codes.set(s.id, `HVAC${i + 1}`);
    s.indoorUnits.forEach((d) => codes.set(d.id, `UI${++indoor}`));
  });
  project.plenums.forEach((pl, i) => codes.set(pl.id, `PL${i + 1}`));
  project.pillars?.forEach((c, i) => codes.set(c.id, `PIL${i + 1}`));
  project.ducts?.forEach((c, i) => codes.set(c.id, `CAN${i + 1}`));
  project.hydronicSystems?.forEach((s, i) => {
    codes.set(s.id, `IDR${i + 1}`);
    codes.set(s.outdoorUnit.id, `PDC${i + 1}`);
  });
  return codes;
}
