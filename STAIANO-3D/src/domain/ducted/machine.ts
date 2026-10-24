import type { Project } from "@/schemas/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";

type DuctedSystem = Project["hvacSystems"][number];

/** Risolve anche il corpo visibile del ventilconvettore nella sua distribuzione aria. */
export function ductedMachineForDevice(project: Project, id: string) {
  const system = project.hvacSystems.find(
    (item) =>
      item.type === "ducted" &&
      (item.fanCoilId === id ||
        item.indoorUnits.some((unit) => unit.id === id)),
  );
  const unit =
    system?.fanCoilId === id
      ? system.indoorUnits[0]
      : system?.indoorUnits.find((item) => item.id === id);
  if (!system || !unit) return null;
  return {
    system,
    unit,
    locked:
      unit.locked ||
      !!project.fanCoils?.find((item) => item.id === system.fanCoilId)?.locked,
  };
}

/** Centro fisico della macchina; il ventilconvettore conserva la propria quota. */
export function ductedMachineElevationM(
  project: Project,
  system: DuctedSystem,
  unit: DuctedSystem["indoorUnits"][number],
) {
  const fanCoil = system.fanCoilId
    ? project.fanCoils?.find((item) => item.id === system.fanCoilId)
    : undefined;
  if (fanCoil)
    return (
      fanCoil.elevationM +
      (fanCoil.mounting === "ceiling" ? fanCoil.depthMm / 2000 : 0)
    );
  const room = project.rooms.find((item) => item.id === unit.roomId)!;
  return room.heightM - unit.heightMm / 2000 - 0.05;
}

/** Manual values are operator declarations, never verified manufacturer data. */
export function resolveDuctedMachine(system: DuctedSystem) {
  if (system.type !== "ducted" || system.compatibilityStatus === "invalid")
    return null;
  // Il ventilconvettore canalizzabile presta la propria portata alla
  // distribuzione aeraulica: non è una macchina a espansione diretta.
  if (system.fanCoilId) {
    const manual = system.genericMachine;
    return manual
      ? {
          manufacturer: manual.manufacturer,
          model: manual.model,
          maxAirflowM3h: manual.maxAirflowM3h,
          dataOrigin: "fanCoil" as const,
          product: null,
        }
      : null;
  }
  if (system.genericMachine) {
    const manual = system.genericMachine;
    return {
      manufacturer: manual.manufacturer,
      model: manual.model,
      maxAirflowM3h: manual.maxAirflowM3h,
      dataOrigin: "manual" as const,
      product: null,
    };
  }
  if (
    system.dataOrigin === "manual" ||
    system.compatibilityStatus !== "verified"
  )
    return null;
  const product = hvacProductAtVersion(system.productId, system.catalogVersion);
  const maximum = maximumAirflowOption(product);
  return product?.kind === "ducted" && product.pairingVerified && maximum
    ? {
        manufacturer: product.manufacturer,
        model: product.indoorModel,
        maxAirflowM3h: maximum.airflowM3h,
        dataOrigin: "catalog" as const,
        product,
      }
    : null;
}

export function ductedMaximumAirflow(system: DuctedSystem) {
  return resolveDuctedMachine(system)?.maxAirflowM3h ?? null;
}

/** Chiave stabile dell'insieme di ambienti serviti, indipendente dall'ordine. */
export function servedRoomsKey(roomIds: readonly string[]) {
  return [...new Set(roomIds)].sort().join("|");
}

/**
 * Conta le macchine che serviranno gli stessi ambienti: quella in esame più le
 * altre. Passare l'id della macchina in esame quando è già nel progetto, per
 * non contarla due volte. Il carico si divide fra loro: ripeterlo per ogni
 * macchina consiglierebbe una taglia enorme per ciascuna.
 */
export function machinesServingSameRooms(
  project: Project,
  roomIds: readonly string[],
  excludeSystemId?: string,
) {
  if (!roomIds.length) return 1;
  const key = servedRoomsKey(roomIds);
  return (
    1 +
    project.hvacSystems.filter(
      (system) =>
        system.type === "ducted" &&
        system.id !== excludeSystemId &&
        system.roomIds.length > 0 &&
        servedRoomsKey(system.roomIds) === key,
    ).length
  );
}

/** Divisore del carico: macchine dichiarate sul sistema, altrimenti quelle presenti. */
export function machineLoadDivisor(
  project: Project,
  roomIds: readonly string[],
  declared?: number,
  excludeSystemId?: string,
) {
  return (
    declared ?? machinesServingSameRooms(project, roomIds, excludeSystemId)
  );
}
