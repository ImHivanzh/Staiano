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
import { assignInstallationRooms, installationRoom } from "../installations";
export function applyDuctedSystem(
  project: Project,
  roomIds: string[],
  manufacturer: string,
  existingId: string | null,
  productId: string | null = null,
  installationId?: string,
): Project {
  project = assignInstallationRooms(project, installationId, "ducted", roomIds);
  const rooms = project.rooms.filter((r) => roomIds.includes(r.id));
  if (
    !rooms.length ||
    rooms.length !== new Set(roomIds).size ||
    rooms.some(
      (r) =>
        !!r.conditioningExclusion ||
        r.geometryStatus === "unresolved" ||
        !project.floors.find((f) => f.id === r.floorId)?.scaleVerified,
    )
  )
    throw new Error("Selezionare stanze valide con scala verificata.");
  if (
    !installationId &&
    project.hvacSystems.some(
      (s) =>
        s.id !== existingId && s.roomIds.some((id) => roomIds.includes(id)),
    )
  )
    throw new Error(
      "Una stanza è già servita da un altro sistema. Modificare prima quella zona.",
    );
  const load = rooms.reduce((sum, r) => sum + r.designLoadW, 0),
    candidates = selectDuctedMachine(load, manufacturer, hvacCatalog.products),
    machine = productId
      ? candidates.find((product) => product.id === productId)
      : candidates[0];
  if (!machine)
    throw new Error(
      productId
        ? "La macchina scelta non è compatibile con marca e fabbisogno degli ambienti."
        : "Nessuna macchina verificata di questa marca soddisfa il fabbisogno totale.",
    );
  const id = existingId ?? crypto.randomUUID(),
    previous = project.hvacSystems.find((s) => s.id === existingId),
    removedRoomIds =
      previous?.roomIds.filter((r) => !roomIds.includes(r)) ?? [];
  if (
    installationId &&
    previous?.installationId &&
    previous.installationId !== installationId
  )
    throw new Error("La macchina appartiene a un altro impianto.");
  const system: Project["hvacSystems"][number] = {
    id,
    type: "ducted",
    ...(installationId
      ? { installationId }
      : previous?.installationId
        ? { installationId: previous.installationId }
        : {}),
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
      const room = project.rooms.find((r) => r.id === u.roomId) ?? rooms[0];
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
    catalogVersions: { ...project.catalogVersions, HVAC: hvacCatalog.version },
  });
}
export function ductedRoomAllocation(
  project: Project,
  roomId: string,
  installationId?: string,
  systemId?: string,
) {
  if (project.rooms.find((room) => room.id === roomId)?.conditioningExclusion)
    return null;
  const system = project.hvacSystems.find(
    (s) =>
      s.type === "ducted" &&
      (!systemId || s.id === systemId) &&
      s.roomIds.includes(roomId) &&
      (!installationId || s.installationId === installationId),
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
    project.rooms
      .filter((r) => system.roomIds.includes(r.id) && !r.conditioningExclusion)
      .map((room) => installationRoom(project, room, system.installationId)),
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
  installationId?: string,
): Project {
  project = assignInstallationRooms(project, installationId, "ducted", roomIds);
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
        !!r.conditioningExclusion ||
        r.geometryStatus === "unresolved" ||
        !project.floors.find((f) => f.id === r.floorId)?.scaleVerified,
    )
  )
    throw new Error("Selezionare stanze valide con scala verificata.");
  if (
    !installationId &&
    project.hvacSystems.some(
      (s) =>
        s.id !== existingId && s.roomIds.some((id) => roomIds.includes(id)),
    )
  )
    throw new Error(
      "Una stanza è già servita da un altro sistema. Modificare prima quella zona.",
    );
  const previous = project.hvacSystems.find((s) => s.id === existingId);
  if (
    installationId &&
    previous?.installationId &&
    previous.installationId !== installationId
  )
    throw new Error("La macchina appartiene a un altro impianto.");
  if (previous && previous.type !== "ducted")
    throw new Error("Selezionare un sistema canalizzato da modificare.");
  const id = previous?.id ?? crypto.randomUUID();
  const manual = parsed.data;
  const removedRoomIds =
    previous?.roomIds.filter((roomId) => !roomIds.includes(roomId)) ?? [];
  const system: Project["hvacSystems"][number] = {
    id,
    type: "ducted",
    ...(installationId
      ? { installationId }
      : previous?.installationId
        ? { installationId: previous.installationId }
        : {}),
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
            const room =
              project.rooms.find((r) => r.id === u.roomId) ?? rooms[0];
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
  });
}
export function removeHvacSystem(project: Project, id: string): Project {
  const remaining = project.hvacSystems.filter((s) => s.id !== id);
  return {
    ...project,
    hvacSystems: remaining,
    plenums: project.plenums.filter((pl) => pl.systemId !== id),
    airTerminals: project.airTerminals.filter(
      (t) => t.systemId !== id && t.pendingSystemId !== id,
    ),
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
