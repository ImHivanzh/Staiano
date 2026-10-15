import type { Project } from "@/schemas/project";
import { ductedRoomAllocation } from "../ducted/apply";
import { ductedMaximumAirflow } from "../ducted/machine";

export function terminalAirflowBalance(
  project: Project,
  systemId: string,
  use: "supply" | "return",
  roomId?: string,
) {
  const system = project.hvacSystems.find((item) => item.id === systemId);
  const required = system
    ? use === "supply" && roomId
      ? (ductedRoomAllocation(project, roomId, system.installationId, systemId)
          ?.airflowM3h ?? 0)
      : (ductedMaximumAirflow(system) ?? 0)
    : 0;
  const installed = project.airTerminals
    .filter(
      (item) =>
        item.systemId === systemId &&
        item.use === use &&
        (use === "return" || !roomId || item.roomId === roomId),
    )
    .reduce((sum, item) => sum + item.availableAirflowM3h, 0);
  return {
    required,
    installed,
    remaining: Math.max(0, required - installed),
    excess: Math.max(0, installed - required),
  };
}
