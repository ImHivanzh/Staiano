import type { Project } from "@/schemas/project";
import { hvacCatalogAtVersion } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { ductedMaximumAirflow } from "./machine";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
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
    if (system.genericMachine)
      return {
        ...system,
        manufacturer: system.genericMachine.manufacturer,
        airflowM3h: system.genericMachine.maxAirflowM3h,
        capacityW: system.genericMachine.coolingCapacityW ?? null,
        dataOrigin: "manual" as const,
        compatibilityStatus: "unverifiable" as const,
      };
    const catalog = hvacCatalogAtVersion(system.catalogVersion);
    if (!catalog)
      return { ...system, compatibilityStatus: "unverifiable" as const };
    if (
      system.decisionOrigin === "confirmed" ||
      system.decisionOrigin === "manual" ||
      system.indoorUnits.some((u) => u.locked)
    ) {
      const chosen = hvacProductAtVersion(
        system.productId,
        system.catalogVersion,
      );
      const maximum = maximumAirflowOption(chosen);
      return chosen && maximum
        ? {
            ...system,
            capacityW: chosen.coolingCapacityW,
            airflowM3h: maximum.airflowM3h,
            compatibilityStatus: "verified" as const,
          }
        : { ...system, compatibilityStatus: "unverifiable" as const };
    }
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
          airflowM3h: maximumAirflowOption(machine)!.airflowM3h,
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
          ductedMaximumAirflow(s) !== null &&
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
  // The final physical unit carries only the floating-point residual. No design
  // flow is rounded, and missing/legacy points never absorb another point's flow.
  for (const system of systems) {
    if (
      system.type !== "ducted" ||
      ductedMaximumAirflow(system) === null ||
      system.airflowM3h === null
    )
      continue;
    const rooms = project.rooms.filter((r) => system.roomIds.includes(r.id));
    for (const use of ["supply", "return"] as const) {
      const terminals = airTerminals.filter(
        (t) => t.systemId === system.id && t.use === use,
      );
      if (
        !terminals.length ||
        terminals.some((t) => {
          const room = rooms.find((r) => r.id === t.roomId);
          const points = room
            ? use === "supply"
              ? room.supplyPoints
              : room.returnPoints
            : 0;
          return (
            needsTerminalReconfiguration(t) ||
            t.pointIndex === null ||
            t.pointIndex < 0 ||
            t.pointIndex >= points
          );
        }) ||
        rooms.some((room) => {
          const points =
            use === "supply" ? room.supplyPoints : room.returnPoints;
          return Array.from({ length: points }, (_, index) => index).some(
            (index) =>
              !terminals.some(
                (t) => t.roomId === room.id && t.pointIndex === index,
              ),
          );
        })
      )
        continue;
      const last = terminals[terminals.length - 1];
      last.requiredAirflowM3h =
        system.airflowM3h -
        terminals
          .slice(0, -1)
          .reduce((sum, t) => sum + t.requiredAirflowM3h, 0);
    }
  }
  // Operator pieces have no mandatory one-point/one-vent mapping. Allocate room
  // demand by declared capacity (length for a homogeneous linear model).
  for (const system of systems.filter((s) => s.type === "ducted")) {
    const flow = ductedMaximumAirflow(system);
    const rooms = project.rooms.filter((r) => system.roomIds.includes(r.id));
    if (!flow || rooms.some((r) => r.geometryStatus !== "closed")) continue;
    const allocations = distributeAirflow(rooms, flow);
    for (const allocation of allocations)
      for (const use of ["supply", "return"] as const) {
        const pieces = airTerminals.filter(
          (t) =>
            t.systemId === system.id &&
            t.roomId === allocation.roomId &&
            t.use === use,
        );
        if (
          !pieces.some((t) => t.decisionOrigin !== "calculated" || t.proposalId)
        )
          continue;
        const capacity = pieces.reduce(
          (sum, t) => sum + t.availableAirflowM3h,
          0,
        );
        if (capacity <= 0) continue;
        let assigned = 0;
        pieces.forEach((t, i) => {
          t.requiredAirflowM3h =
            i === pieces.length - 1
              ? allocation.airflowM3h - assigned
              : (allocation.airflowM3h * t.availableAirflowM3h) / capacity;
          assigned += t.requiredAirflowM3h;
        });
      }
  }
  return { ...project, hvacSystems: systems, airTerminals };
}
