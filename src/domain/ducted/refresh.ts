import type { Project } from "@/schemas/project";
import { hvacCatalogAtVersion } from "@/domain/catalogs/hvac";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
/** Refresh automatic machine selection and demand; installed terminal style stays chosen. */
export function refreshDuctedBindings(project: Project): Project {
  const systems = project.hvacSystems.map((system) => {
    if (system.type !== "ducted") return system;
    if (
      project.rooms.some(
        (r) =>
          system.roomIds.includes(r.id) && r.geometryStatus === "unresolved",
      )
    )
      return { ...system, compatibilityStatus: "invalid" as const };
    const catalog = hvacCatalogAtVersion(system.catalogVersion);
    if (!catalog)
      return { ...system, compatibilityStatus: "unverifiable" as const };
    const load = project.rooms
        .filter((r) => system.roomIds.includes(r.id))
        .reduce((sum, r) => sum + r.designLoadW, 0),
      machine =
        load > 0
          ? selectDuctedMachine(load, system.manufacturer, catalog.products)[0]
          : null;
    return machine
      ? {
          ...system,
          productId: machine.id,
          capacityW: machine.coolingCapacityW,
          airflowM3h:
            machine.airflowOptions[machine.defaultAirflowIndex!].airflowM3h,
          compatibilityStatus: "verified" as const,
        }
      : { ...system, compatibilityStatus: "invalid" as const };
  });
  const airTerminals = project.airTerminals.map((terminal) => {
    if (needsTerminalReconfiguration(terminal)) return terminal;
    const room = project.rooms.find((r) => r.id === terminal.roomId);
    if (!room || room.geometryStatus === "unresolved") return terminal;
    const system = systems.find(
        (s) =>
          s.id === terminal.systemId &&
          s.type === "ducted" &&
          s.airflowM3h !== null,
      ),
      rooms = system
        ? project.rooms.filter((r) => system.roomIds.includes(r.id))
        : [];
    const allocation =
        system && rooms.length
          ? distributeAirflow(rooms, system.airflowM3h!).find(
              (r) => r.roomId === room.id,
            )
          : null,
      points =
        terminal.use === "supply" ? room.supplyPoints : room.returnPoints;
    const siblings = project.airTerminals.filter(
      (t) =>
        t.systemId === terminal.systemId &&
        t.roomId === room.id &&
        t.use === terminal.use &&
        t.pointIndex === terminal.pointIndex,
    ).length;
    return {
      ...terminal,
      elevationM:
        terminal.mounting === "ceiling" ? room.heightM : terminal.elevationM,
      requiredAirflowM3h: allocation
        ? allocation.airflowM3h / points / Math.max(1, siblings)
        : terminal.requiredAirflowM3h,
    };
  });
  return { ...project, hvacSystems: systems, airTerminals };
}
