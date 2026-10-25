import type { Duct, Project } from "@/schemas/project";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";

export function ductAirflowM3h(project: Project, duct: Duct): number | null {
  const terminal = project.airTerminals.find(
    (item) => item.id === duct.terminalId,
  );
  if (
    !terminal ||
    terminal.systemId !== duct.systemId ||
    needsTerminalReconfiguration(terminal) ||
    (project.ducts ?? []).filter((item) => item.terminalId === terminal.id)
      .length !== 1
  )
    return null;
  return terminal.requiredAirflowM3h;
}

export function ductAirVelocityMs(project: Project, duct: Duct): number | null {
  const flow = ductAirflowM3h(project, duct);
  if (flow === null || duct.shape !== "circle" || !duct.diameterMm) return null;
  return flow / (3600 * Math.PI * (duct.diameterMm / 2000) ** 2);
}
