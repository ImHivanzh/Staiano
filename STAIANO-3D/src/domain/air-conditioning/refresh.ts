import type { Project } from "@/schemas/project";
import { splitCatalogAtVersion } from "@/domain/catalogs/splits";
import { sizeSplitSystems } from "./size";
import { splitSystemFromSolution } from "./apply";
/** Revalidate chosen systems without silently replacing operator models. */
export function refreshSplitBindings(project: Project): Project {
  const hvacSystems = project.hvacSystems.map((original) => {
    const system =
      original.type === "split" && original.indoorUnits.length
        ? {
            ...original,
            roomIds: [...new Set(original.indoorUnits.map((u) => u.roomId))],
          }
        : original;
    if (system.type !== "split") return system;
    const catalog = splitCatalogAtVersion(system.catalogVersion);
    if (!catalog)
      return { ...system, compatibilityStatus: "unverifiable" as const };
    if (
      new Set(system.indoorUnits.map((u) => u.roomId)).size !==
      system.indoorUnits.length
    )
      return { ...system, compatibilityStatus: "invalid" as const };
    const solutions = sizeSplitSystems(
      project,
      system.roomIds,
      system.manufacturer,
      catalog,
    );
    if (
      system.decisionOrigin === "confirmed" ||
      system.decisionOrigin === "manual" ||
      system.indoorUnits.some((u) => u.locked)
    ) {
      const chosen = solutions.find(
        (s) => s.combination.id === system.productId,
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
    return splitSystemFromSolution(
      {
        ...project,
        hvacSystems: project.hvacSystems.map((s) =>
          s.id === system.id ? system : s,
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
        (s) => s.type === "ducted" && s.roomIds.includes(room.id),
      )
        ? "ducted"
        : hvacSystems.some(
              (s) => s.type === "split" && s.roomIds.includes(room.id),
            )
          ? "split"
          : room.systemType === "split"
            ? project.radiators.some((d) => d.roomId === room.id)
              ? "radiator"
              : "none"
            : room.systemType,
    })),
  };
}
