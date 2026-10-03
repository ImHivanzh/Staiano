import type { Project } from "@/schemas/project";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
export function applyDuctedSystem(
  project: Project,
  roomIds: string[],
  manufacturer: string,
  existingId: string | null,
): Project {
  const rooms = project.rooms.filter((r) => roomIds.includes(r.id));
  if (
    !rooms.length ||
    rooms.length !== new Set(roomIds).size ||
    rooms.some(
      (r) =>
        r.geometryStatus === "unresolved" ||
        !project.floors.find((f) => f.id === r.floorId)?.scaleVerified,
    )
  )
    throw new Error("Selezionare stanze valide con scala verificata.");
  if (
    project.hvacSystems.some(
      (s) =>
        s.id !== existingId && s.roomIds.some((id) => roomIds.includes(id)),
    )
  )
    throw new Error(
      "Una stanza è già servita da un altro sistema. Modificare prima quella zona.",
    );
  const load = rooms.reduce((sum, r) => sum + r.designLoadW, 0),
    machine = selectDuctedMachine(load, manufacturer, hvacCatalog.products)[0];
  if (!machine)
    throw new Error(
      "Nessuna macchina verificata di questa marca soddisfa il fabbisogno totale.",
    );
  const id = existingId ?? crypto.randomUUID(),
    previous = project.hvacSystems.find((s) => s.id === existingId),
    removedRoomIds =
      previous?.roomIds.filter((r) => !roomIds.includes(r)) ?? [];
  const system: Project["hvacSystems"][number] = {
    id,
    type: "ducted",
    manufacturer,
    productId: machine.id,
    roomIds,
    capacityW: machine.coolingCapacityW,
    airflowM3h: machine.airflowOptions[machine.defaultAirflowIndex!].airflowM3h,
    catalogVersion: hvacCatalog.version,
    indoorUnits: [],
    compatibilityStatus: "verified",
  };
  return {
    ...project,
    hvacSystems: [...project.hvacSystems.filter((s) => s.id !== id), system],
    rooms: project.rooms.map((r) =>
      roomIds.includes(r.id)
        ? { ...r, systemType: "ducted" }
        : removedRoomIds.includes(r.id)
          ? {
              ...r,
              systemType: project.radiators.some((d) => d.roomId === r.id)
                ? "radiator"
                : "none",
            }
          : r,
    ),
    airTerminals: project.airTerminals.filter(
      (t) => t.systemId !== id || roomIds.includes(t.roomId),
    ),
    catalogVersions: { ...project.catalogVersions, HVAC: hvacCatalog.version },
  };
}
export function ductedRoomAllocation(project: Project, roomId: string) {
  const system = project.hvacSystems.find(
    (s) => s.type === "ducted" && s.roomIds.includes(roomId),
  );
  if (!system?.airflowM3h) return null;
  if (
    project.rooms.some(
      (r) => system.roomIds.includes(r.id) && r.geometryStatus === "unresolved",
    )
  )
    return null;
  const allocation = distributeAirflow(
    project.rooms.filter((r) => system.roomIds.includes(r.id)),
    system.airflowM3h,
  ).find((a) => a.roomId === roomId);
  return allocation ? { system, ...allocation } : null;
}
export function removeHvacSystem(project: Project, id: string): Project {
  const remaining = project.hvacSystems.filter((s) => s.id !== id);
  return {
    ...project,
    hvacSystems: remaining,
    airTerminals: project.airTerminals.filter((t) => t.systemId !== id),
    rooms: project.rooms.map((r) => ({
      ...r,
      systemType: remaining.some(
        (s) => s.type === "ducted" && s.roomIds.includes(r.id),
      )
        ? "ducted"
        : remaining.some((s) => s.type === "split" && s.roomIds.includes(r.id))
          ? "split"
          : project.radiators.some((d) => d.roomId === r.id)
            ? "radiator"
            : "none",
    })),
  };
}
