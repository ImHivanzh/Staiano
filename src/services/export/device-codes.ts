import type { Project } from "@/schemas/project";

/** Stable within a project snapshot, independent of the selected floor. */
export function deviceCodes(project: Project): Map<string, string> {
  const codes = new Map<string, string>();
  project.radiators.forEach((d, i) => codes.set(d.id, `RAD${i + 1}`));
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
  return codes;
}
