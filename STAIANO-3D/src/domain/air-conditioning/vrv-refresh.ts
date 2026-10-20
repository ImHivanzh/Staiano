import type { Project } from "@/schemas/project";
import { vrvCatalogAtVersion } from "@/domain/catalogs/vrv";
import { sizeVrvSystems } from "./vrv-size";
import { vrvSystemFromSolution } from "./vrv-apply";

/** Revalidate chosen VRV systems without silently replacing operator models. */
export function refreshVrvBindings(project: Project): Project {
  const hvacSystems = project.hvacSystems.map((original) => {
    if (original.type !== "vrv") return original;
    const system = original.indoorUnits.length
      ? {
          ...original,
          roomIds: [...new Set(original.indoorUnits.map((u) => u.roomId))],
        }
      : original;
    const catalog = vrvCatalogAtVersion(system.catalogVersion);
    if (!catalog)
      return { ...system, compatibilityStatus: "unverifiable" as const };
    if (
      new Set(system.indoorUnits.map((u) => u.roomId)).size !==
      system.indoorUnits.length
    )
      return { ...system, compatibilityStatus: "invalid" as const };
    const solutions = sizeVrvSystems(project, system.roomIds, catalog);
    if (
      system.decisionOrigin === "confirmed" ||
      system.decisionOrigin === "manual" ||
      system.indoorUnits.some((u) => u.locked)
    ) {
      const chosen = solutions.find(
        (solution) => solution.outdoor.id === system.productId,
      );
      return {
        ...system,
        compatibilityStatus: chosen
          ? ("verified" as const)
          : ("invalid" as const),
      };
    }
    if (!solutions.length)
      return { ...system, compatibilityStatus: "invalid" as const };
    return vrvSystemFromSolution(
      {
        ...project,
        hvacSystems: project.hvacSystems.map((item) =>
          item.id === system.id ? system : item,
        ),
      },
      solutions[0],
      catalog,
      system.id,
    );
  });
  return {
    ...project,
    hvacSystems,
    rooms: project.rooms.map((room) => ({
      ...room,
      systemType: hvacSystems.some(
        (system) => system.type === "ducted" && system.roomIds.includes(room.id),
      )
        ? "ducted"
        : hvacSystems.some(
              (system) =>
                system.type === "vrv" && system.roomIds.includes(room.id),
            )
          ? "vrv"
          : hvacSystems.some(
                (system) =>
                  system.type === "split" && system.roomIds.includes(room.id),
              )
            ? "split"
            : room.systemType === "vrv" || room.systemType === "split"
              ? project.radiators.some((item) => item.roomId === room.id)
                ? "radiator"
                : project.fanCoils?.some((item) => item.roomId === room.id)
                  ? "fanCoil"
                  : "none"
              : room.systemType,
    })),
  };
}
