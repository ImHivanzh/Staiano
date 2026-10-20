import type { Project } from "@/schemas/project";
import { fanCoilProductAtVersion } from "@/domain/catalogs/fan-coils";
import { createInstallation } from "@/domain/installations";
import { newId } from "@/domain/project";

type AirSystem = Project["hvacSystems"][number];
type FanCoil = NonNullable<Project["fanCoils"]>[number];
export type FanCoilDischarge = NonNullable<
  NonNullable<AirSystem["genericMachine"]>["dischargeConnection"]
>;

/** La distribuzione aeraulica è un sistema canalizzato dedicato all'unità. */
export function fanCoilAirSystem(project: Project, fanCoilId: string) {
  return project.hvacSystems.find(
    (system) => system.type === "ducted" && system.fanCoilId === fanCoilId,
  );
}

export function fanCoilAirData(project: Project, fanCoilId: string) {
  const unit = project.fanCoils?.find((item) => item.id === fanCoilId);
  if (!unit) return null;
  const product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  const point = product?.operatingPoints[unit.operatingPointIndex];
  return product && point ? { unit, product, point } : null;
}

function mirrorUnit(
  unit: FanCoil,
  productId: string,
): AirSystem["indoorUnits"][number] {
  return {
    id: newId(),
    roomId: unit.roomId,
    floorId: unit.floorId,
    wallId: unit.wallId,
    position: { ...unit.position },
    rotation: unit.rotation,
    widthMm: unit.widthMm,
    heightMm: unit.heightMm,
    depthMm: unit.depthMm,
    productId,
    catalogVersion: unit.catalogVersion,
    locked: unit.locked,
  };
}

/**
 * Crea, se assente, la distribuzione aeraulica del ventilconvettore.
 * Portata e potenza restano quelle del punto di funzionamento scelto; il
 * sistema vive nell'impianto canalizzato dei terminali, non in quello idronico.
 */
export function ensureFanCoilAirSystem(
  project: Project,
  fanCoilId: string,
  installationId?: string,
): { project: Project; systemId: string } {
  const existing = fanCoilAirSystem(project, fanCoilId);
  if (existing) return { project, systemId: existing.id };
  const data = fanCoilAirData(project, fanCoilId);
  if (!data)
    throw new Error(
      "Punto di funzionamento del ventilconvettore non verificabile nel catalogo.",
    );
  const { unit, product, point } = data;
  if (!point.airflowM3h)
    throw new Error(
      "Il punto scelto non dichiara la portata d'aria: scegli un'altra velocità prima di collegare le bocchette.",
    );
  let next = project;
  let installation = installationId
    ? project.installations.find(
        (item) => item.id === installationId && item.type === "ducted",
      )
    : undefined;
  if (!installation) {
    next = createInstallation(project, "ducted", unit.roomId);
    installation = next.installations.at(-1)!;
    next = {
      ...next,
      installations: next.installations.map((item) =>
        item.id === installation!.id
          ? { ...item, name: `Aeraulica · ${product.model}` }
          : item,
      ),
    };
  }
  const systemId = newId();
  const system: AirSystem = {
    id: systemId,
    type: "ducted",
    installationId: installation.id,
    name: `Aeraulica · ${product.manufacturer} ${product.model}`,
    manufacturer: product.manufacturer,
    productId: product.id,
    roomIds: [],
    capacityW: point.coolingW,
    airflowM3h: point.airflowM3h,
    catalogVersion: unit.catalogVersion,
    fanCoilId: unit.id,
    genericMachine: {
      manufacturer: product.manufacturer,
      model: product.model,
      maxAirflowM3h: point.airflowM3h,
      coolingCapacityW: point.coolingW,
      heatingCapacityW: point.heatingW,
      widthMm: unit.widthMm,
      heightMm: unit.heightMm,
      depthMm: unit.depthMm,
    },
    dataOrigin: "fanCoil",
    compatibilityStatus: "unverifiable",
    decisionOrigin: "confirmed",
    indoorUnits: [mirrorUnit(unit, product.id)],
    outdoorUnit: null,
    linearPlan: null,
  };
  return {
    project: {
      ...next,
      hvacSystems: [...next.hvacSystems, system],
    },
    systemId,
  };
}

export function setFanCoilAirDischarge(
  project: Project,
  fanCoilId: string,
  discharge: FanCoilDischarge | null,
): Project {
  const system = fanCoilAirSystem(project, fanCoilId);
  if (!system) throw new Error("Distribuzione aeraulica non ancora creata.");
  const machine = system.genericMachine;
  if (!machine)
    throw new Error("Dati della macchina aeraulica non disponibili.");
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((item) =>
      item.id === system.id
        ? {
            ...item,
            genericMachine: {
              ...machine,
              dischargeConnection: discharge ?? undefined,
            },
          }
        : item,
    ),
  };
}

/** Rimuove la sola aria: i terminali restano in pianta come "da collegare". */
export function removeFanCoilAirSystem(
  project: Project,
  fanCoilId: string,
): Project {
  const system = fanCoilAirSystem(project, fanCoilId);
  if (!system) return project;
  return {
    ...project,
    hvacSystems: project.hvacSystems.filter((item) => item.id !== system.id),
    plenums: project.plenums.filter((item) => item.systemId !== system.id),
    ducts: project.ducts?.filter((item) => item.systemId !== system.id),
    airTerminals: project.airTerminals.map((terminal) =>
      terminal.systemId === system.id
        ? {
            ...terminal,
            systemId: null,
            pendingSystemId: undefined,
            pendingMachineId: undefined,
            plenumId: null,
          }
        : terminal.plenumId &&
            project.plenums.some(
              (plenum) =>
                plenum.id === terminal.plenumId &&
                plenum.systemId === system.id,
            )
          ? { ...terminal, plenumId: null }
          : terminal,
    ),
  };
}

/**
 * Riallinea il sistema aeraulico al ventilconvettore: unico apparecchio
 * fisico, portata e potenze del punto scelto, stessa posizione in pianta.
 */
export function syncFanCoilAirSystems(project: Project): Project {
  if (!project.hvacSystems.some((system) => system.fanCoilId)) return project;
  const fanCoils = new Map((project.fanCoils ?? []).map((u) => [u.id, u]));
  const removed = new Set<string>();
  const systems = project.hvacSystems.map((system) => {
    if (!system.fanCoilId) return system;
    const unit = fanCoils.get(system.fanCoilId);
    if (!unit) {
      removed.add(system.id);
      return system;
    }
    const product = fanCoilProductAtVersion(
      unit.productId,
      unit.catalogVersion,
    );
    const point = product?.operatingPoints[unit.operatingPointIndex];
    const mirror = system.indoorUnits[0];
    const indoorUnit: AirSystem["indoorUnits"][number] = {
      id: mirror?.id ?? newId(),
      roomId: unit.roomId,
      floorId: unit.floorId,
      wallId: unit.wallId,
      position: { ...unit.position },
      rotation: unit.rotation,
      widthMm: unit.widthMm,
      heightMm: unit.heightMm,
      depthMm: unit.depthMm,
      productId: product?.id ?? unit.productId,
      catalogVersion: unit.catalogVersion,
      locked: mirror?.locked ?? false,
    };
    if (!product || !point || !point.airflowM3h)
      return {
        ...system,
        catalogVersion: unit.catalogVersion,
        fanCoilId: unit.id,
        dataOrigin: "fanCoil" as const,
        compatibilityStatus: "invalid" as const,
        indoorUnits: [indoorUnit],
      };
    const previousDischarge = system.genericMachine?.dischargeConnection;
    return {
      ...system,
      manufacturer: product.manufacturer,
      productId: product.id,
      catalogVersion: unit.catalogVersion,
      fanCoilId: unit.id,
      capacityW: point.coolingW,
      airflowM3h: point.airflowM3h,
      genericMachine: {
        manufacturer: product.manufacturer,
        model: product.model,
        maxAirflowM3h: point.airflowM3h,
        coolingCapacityW: point.coolingW,
        heatingCapacityW: point.heatingW,
        widthMm: unit.widthMm,
        heightMm: unit.heightMm,
        depthMm: unit.depthMm,
        ...(previousDischarge
          ? { dischargeConnection: previousDischarge }
          : {}),
      },
      dataOrigin: "fanCoil" as const,
      compatibilityStatus: "unverifiable" as const,
      indoorUnits: [indoorUnit],
    };
  });
  if (!removed.size) return { ...project, hvacSystems: systems };
  const kept = systems.filter((system) => !removed.has(system.id));
  return {
    ...project,
    hvacSystems: kept,
    plenums: project.plenums.filter(
      (plenum) => !plenum.systemId || !removed.has(plenum.systemId),
    ),
    ducts: project.ducts?.filter((duct) => !removed.has(duct.systemId)),
    airTerminals: project.airTerminals.map((terminal) =>
      terminal.systemId && removed.has(terminal.systemId)
        ? {
            ...terminal,
            systemId: null,
            pendingSystemId: undefined,
            pendingMachineId: undefined,
            plenumId: null,
          }
        : terminal,
    ),
  };
}
