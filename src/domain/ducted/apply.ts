import {
  manualDuctedMachineSchema,
  type ManualDuctedMachine,
  type Project,
} from "@/schemas/project";
import { hvacCatalog } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
import { selectDuctedMachine, distributeAirflow } from "./calculate";
import { ductedMaximumAirflow } from "./machine";
import { refreshDuctedBindings } from "./refresh";
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
    ...(previous?.name !== undefined ? { name: previous.name } : {}),
    ...(previous?.plenumSettings
      ? { plenumSettings: previous.plenumSettings }
      : {}),
    manufacturer,
    productId: machine.id,
    roomIds,
    capacityW: machine.coolingCapacityW,
    airflowM3h: maximumAirflowOption(machine)!.airflowM3h,
    catalogVersion: hvacCatalog.version,
    indoorUnits: (previous?.indoorUnits ?? []).map((u) => {
      const room = rooms.find((r) => r.id === u.roomId) ?? rooms[0];
      return {
        ...u,
        roomId: room.id,
        floorId: room.floorId,
        position: room.id === u.roomId ? u.position : room.centroid,
        widthMm: machine.widthMm ?? u.widthMm,
        heightMm: machine.heightMm ?? u.heightMm,
        depthMm: machine.depthMm ?? u.depthMm,
        productId: machine.id,
        catalogVersion: hvacCatalog.version,
      };
    }),
    compatibilityStatus: "verified",
    decisionOrigin: "confirmed",
    linearPlan: previous?.linearPlan ?? null,
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
  if (!system) return null;
  const maximumAirflowM3h = ductedMaximumAirflow(system);
  if (maximumAirflowM3h === null) return null;
  if (
    project.rooms.some(
      (r) => system.roomIds.includes(r.id) && r.geometryStatus === "unresolved",
    )
  )
    return null;
  const allocation = distributeAirflow(
    project.rooms.filter((r) => system.roomIds.includes(r.id)),
    maximumAirflowM3h,
  ).find((a) => a.roomId === roomId);
  return allocation
    ? { system: { ...system, airflowM3h: maximumAirflowM3h }, ...allocation }
    : null;
}
export function applyManualDuctedSystem(
  project: Project,
  roomIds: string[],
  input: ManualDuctedMachine,
  existingId: string | null = null,
): Project {
  const parsed = manualDuctedMachineSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "Marca, modello e portata massima positiva necessari. Verificare le quote inserite.",
    );
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
  const previous = project.hvacSystems.find((s) => s.id === existingId);
  if (previous && previous.type !== "ducted")
    throw new Error("Selezionare un sistema canalizzato da modificare.");
  const id = previous?.id ?? crypto.randomUUID();
  const manual = parsed.data;
  const removedRoomIds =
    previous?.roomIds.filter((roomId) => !roomIds.includes(roomId)) ?? [];
  const system: Project["hvacSystems"][number] = {
    id,
    type: "ducted",
    ...(previous?.name !== undefined ? { name: previous.name } : {}),
    ...(previous?.plenumSettings
      ? { plenumSettings: previous.plenumSettings }
      : {}),
    manufacturer: manual.manufacturer,
    productId: `manual-${id}`,
    roomIds,
    capacityW: manual.coolingCapacityW ?? null,
    airflowM3h: manual.maxAirflowM3h,
    catalogVersion: "manual",
    genericMachine: manual,
    dataOrigin: "manual",
    indoorUnits:
      manual.widthMm && manual.heightMm && manual.depthMm
        ? (previous?.indoorUnits ?? []).map((u) => {
            const room = rooms.find((r) => r.id === u.roomId) ?? rooms[0];
            return {
              ...u,
              roomId: room.id,
              floorId: room.floorId,
              position: room.id === u.roomId ? u.position : room.centroid,
              widthMm: manual.widthMm!,
              heightMm: manual.heightMm!,
              depthMm: manual.depthMm!,
              productId: `manual-${id}`,
              catalogVersion: "manual",
            };
          })
        : [],
    compatibilityStatus: "unverifiable",
    decisionOrigin: "manual",
    linearPlan: previous?.linearPlan ?? null,
  };
  return refreshDuctedBindings({
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
  });
}
export function removeHvacSystem(project: Project, id: string): Project {
  const remaining = project.hvacSystems.filter((s) => s.id !== id);
  return {
    ...project,
    hvacSystems: remaining,
    plenums: project.plenums.filter((pl) => pl.systemId !== id),
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
