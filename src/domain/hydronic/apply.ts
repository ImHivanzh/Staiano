import type { Project } from "@/schemas/project";
import {
  heatPumpCatalog,
  heatPumpProductAtVersion,
} from "@/domain/catalogs/heat-pumps";
import {
  hydronicOutdoorValid,
  initialHydronicOutdoorPose,
  type HydronicSystem,
  type HydronicPose,
} from "./placement";

export type HydronicSystemInput = {
  productId: string;
  roomIds: string[];
  fanCoilIds: string[];
  operatingPointIndex: number;
  name?: string;
  systemId?: string;
};
export function applyHydronicSystem(
  project: Project,
  input: HydronicSystemInput,
): Project {
  const existing = project.hydronicSystems?.find(
    (s) => s.id === input.systemId,
  );
  if (input.systemId && !existing)
    throw new Error("Impianto idronico inesistente.");
  if (existing?.outdoorUnit.locked)
    throw new Error(
      "Sbloccare la pompa di calore prima di modificare l’impianto.",
    );
  const version = existing?.catalogVersion ?? heatPumpCatalog.version;
  const product = heatPumpProductAtVersion(input.productId, version);
  if (
    !product ||
    !Number.isInteger(input.operatingPointIndex) ||
    !product.operatingPoints[input.operatingPointIndex]
  )
    throw new Error(
      "Modello o condizioni non disponibili nel catalogo originale.",
    );
  const roomIds = [...new Set(input.roomIds)],
    fanCoilIds = [...new Set(input.fanCoilIds)],
    rooms = roomIds.map((id) => project.rooms.find((r) => r.id === id));
  if (
    !rooms.length ||
    rooms.some((r) => !r || r.conditioningExclusion) ||
    rooms.some((r) => r!.floorId !== rooms[0]!.floorId)
  )
    throw new Error("Selezionare ambienti esistenti sullo stesso piano.");
  const coils = fanCoilIds.map((id) =>
    project.fanCoils?.find((u) => u.id === id),
  );
  if (coils.some((u) => !u || !roomIds.includes(u.roomId)))
    throw new Error("Ventilconvettori non appartenenti agli ambienti serviti.");
  if (
    project.hydronicSystems?.some(
      (s) =>
        s.id !== existing?.id &&
        s.fanCoilIds.some((id) => fanCoilIds.includes(id)),
    )
  )
    throw new Error(
      "Un ventilconvettore può appartenere a un solo impianto idronico.",
    );
  const floorId = rooms[0]!.floorId;
  const pose =
    existing?.outdoorUnit.floorId === floorId
      ? existing.outdoorUnit
      : initialHydronicOutdoorPose(project, floorId, product);
  if (!pose)
    throw new Error(
      "Impossibile individuare una posizione esterna con scala e ambienti verificati.",
    );
  const unit = {
    ...pose,
    id: existing?.outdoorUnit.id ?? crypto.randomUUID(),
    floorId,
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    depthMm: product.depthMm,
    elevationM: Math.max(pose.elevationM, product.heightMm / 2000),
    locked: false,
  };
  if (!hydronicOutdoorValid(project, unit))
    throw new Error(
      "L’ingombro della pompa deve essere interamente esterno e libero da muri e ostacoli.",
    );
  const system: HydronicSystem = {
    id: existing?.id ?? crypto.randomUUID(),
    name:
      input.name?.trim() ||
      existing?.name ||
      `Impianto idronico ${(project.hydronicSystems?.length ?? 0) + 1}`,
    productId: product.id,
    catalogVersion: version,
    roomIds,
    fanCoilIds,
    operatingPointIndex: input.operatingPointIndex,
    outdoorUnit: unit,
    pipeWaypoints: existing?.pipeWaypoints?.filter((w) =>
      fanCoilIds.includes(w.fanCoilId),
    ),
  };
  return {
    ...project,
    hydronicSystems: existing
      ? project.hydronicSystems?.map((s) => (s.id === existing.id ? system : s))
      : [...(project.hydronicSystems ?? []), system],
    catalogVersions: { ...project.catalogVersions, HEAT_PUMP: version },
  };
}
export function moveHydronicOutdoorUnit(
  project: Project,
  deviceId: string,
  target: Partial<HydronicPose>,
): Project {
  const system = project.hydronicSystems?.find(
    (s) => s.outdoorUnit.id === deviceId,
  );
  if (!system) throw new Error("Pompa di calore non trovata.");
  if (system.outdoorUnit.locked)
    throw new Error("Sbloccare la pompa di calore prima di spostarla.");
  const outdoorUnit = { ...system.outdoorUnit, ...target };
  if (!hydronicOutdoorValid(project, outdoorUnit))
    throw new Error(
      "Posizione rifiutata: tutta la macchina deve restare all’esterno, senza attraversare muri o apparecchi.",
    );
  return {
    ...project,
    hydronicSystems: project.hydronicSystems?.map((s) =>
      s.id === system.id ? { ...s, outdoorUnit } : s,
    ),
  };
}
export function removeHydronicSystem(
  project: Project,
  systemId: string,
): Project {
  if (
    project.hydronicSystems?.find((s) => s.id === systemId)?.outdoorUnit.locked
  )
    throw new Error("Sbloccare la pompa prima di rimuovere l’impianto.");
  return {
    ...project,
    hydronicSystems: project.hydronicSystems?.filter((s) => s.id !== systemId),
  };
}
