import type { Project } from "@/schemas/project";
import {
  assignInstallationRooms,
  removeEmptiedInstallations,
} from "../installations";
import {
  fanCoilCatalog,
  fanCoilCatalogAtVersion,
  fanCoilProductAtVersion,
  controllerBoardFor,
  fanCoilDefaultPanelType,
  fanCoilPanelTypeValid,
  fanCoilCoverTypeValid,
} from "@/domain/catalogs/fan-coils";
import {
  fanCoilPlacementValid,
  initialFanCoilPose,
  type FanCoilPlacement,
  type FanCoilPose,
} from "./placement";

function associateController(
  unit: FanCoilPlacement,
  controllerId: string | null,
): FanCoilPlacement {
  const catalog = fanCoilCatalogAtVersion(unit.catalogVersion),
    product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  if (!product)
    throw new Error(
      "Modello ventilconvettore non verificabile nel catalogo originale.",
    );
  if (!controllerId)
    return { ...unit, controllerId: null, controllerBoard: null };
  const control = catalog?.controls.find((c) => c.id === controllerId);
  const board = control && controllerBoardFor(product, control);
  if (!board)
    throw new Error(
      "Comando M7 non documentato per questa famiglia e configurazione tubi.",
    );
  return { ...unit, controllerId, controllerBoard: board };
}
export function applyFanCoil(
  project: Project,
  roomId: string,
  productId: string,
  operatingPointIndex: number,
  options: {
    mounting?: FanCoilPlacement["mounting"];
    controllerId?: string | null;
    panelType?: FanCoilPlacement["panelType"];
    coverType?: FanCoilPlacement["coverType"];
    installationId?: string;
  } = {},
): Project {
  project = assignInstallationRooms(
    project,
    options.installationId,
    "fanCoil",
    [roomId],
  );
  const room = project.rooms.find((r) => r.id === roomId),
    product = fanCoilCatalog.products.find((p) => p.id === productId);
  if (
    !room ||
    room.conditioningExclusion ||
    !project.floors.find((f) => f.id === room.floorId)?.scaleVerified
  )
    throw new Error("Configurare un ambiente con scala verificata.");
  if (
    !product ||
    !Number.isInteger(operatingPointIndex) ||
    !product.operatingPoints[operatingPointIndex]
  )
    throw new Error(
      "Selezionare un modello e una velocità presenti nel catalogo.",
    );
  const panelType =
    options.panelType ??
    fanCoilDefaultPanelType(product, options.mounting ?? "wall");
  if (!fanCoilPanelTypeValid(product, options.mounting ?? "wall", panelType))
    throw new Error("Kit di incasso non compatibile con montaggio e modello.");
  const coverType = options.coverType ?? null;
  if (!fanCoilCoverTypeValid(product, coverType))
    throw new Error("Mobile di copertura non compatibile con il modello.");
  const pose = initialFanCoilPose(
    project,
    room,
    product,
    options.mounting ?? "wall",
    panelType,
  );
  if (!pose)
    throw new Error(
      "Nessuna posizione libera contiene l’ingombro del ventilconvettore.",
    );
  const unit = associateController(
    {
      ...pose,
      id: crypto.randomUUID(),
      ...(options.installationId
        ? { installationId: options.installationId }
        : {}),
      roomId,
      floorId: room.floorId,
      productId,
      catalogVersion: fanCoilCatalog.version,
      widthMm: product.widthMm,
      heightMm: product.heightMm,
      depthMm: product.depthMm,
      operatingPointIndex,
      locked: false,
      controllerId: null,
      controllerBoard: null,
      panelType,
      coverType,
    },
    options.controllerId ?? null,
  );
  return {
    ...project,
    fanCoils: [...(project.fanCoils ?? []), unit],
    rooms: project.rooms.map((r) =>
      r.id === roomId ? { ...r, systemType: "fanCoil" } : r,
    ),
    catalogVersions: {
      ...project.catalogVersions,
      FAN_COIL: fanCoilCatalog.version,
    },
  };
}
export function updateFanCoil(
  project: Project,
  id: string,
  patch: Partial<
    FanCoilPose &
      Pick<
        FanCoilPlacement,
        | "operatingPointIndex"
        | "controllerId"
        | "panelType"
        | "coverType"
        | "locked"
      >
  >,
): Project {
  const unit = project.fanCoils?.find((u) => u.id === id);
  if (!unit) throw new Error("Ventilconvettore non trovato.");
  if (Object.keys(patch).length === 1 && typeof patch.locked === "boolean")
    return {
      ...project,
      fanCoils: project.fanCoils?.map((u) =>
        u.id === id ? { ...u, locked: patch.locked! } : u,
      ),
    };
  if (
    unit.locked &&
    !(Object.keys(patch).length === 1 && patch.locked === false)
  )
    throw new Error("Sbloccare il ventilconvettore prima di modificarlo.");
  const product = fanCoilProductAtVersion(unit.productId, unit.catalogVersion);
  if (!product)
    throw new Error(
      "Modello ventilconvettore non verificabile nel catalogo originale.",
    );
  let next = { ...unit, ...patch };
  if (!fanCoilPanelTypeValid(product, next.mounting, next.panelType))
    next = {
      ...next,
      panelType: fanCoilDefaultPanelType(product, next.mounting),
    };
  if (!fanCoilCoverTypeValid(product, next.coverType))
    next = { ...next, coverType: null };
  if (
    !Number.isInteger(next.operatingPointIndex) ||
    !product.operatingPoints[next.operatingPointIndex] ||
    !product.mountings.includes(next.mounting)
  )
    throw new Error("Velocità o montaggio non disponibili per questo modello.");
  if (patch.mounting && patch.mounting !== unit.mounting && !patch.position) {
    const room = project.rooms.find((r) => r.id === unit.roomId)!;
    const pose = initialFanCoilPose(
      { ...project, fanCoils: project.fanCoils?.filter((u) => u.id !== id) },
      room,
      product,
      patch.mounting,
      next.panelType,
    );
    if (!pose)
      throw new Error("Nessuna posizione libera per il montaggio scelto.");
    next = { ...next, ...pose };
  }
  next = associateController(next, next.controllerId);
  if (
    !Number.isFinite(next.elevationM) ||
    next.elevationM <= 0 ||
    !fanCoilPlacementValid(project, next)
  )
    throw new Error(
      "Posizione fuori dall’ambiente oppure sovrapposta a un altro elemento.",
    );
  return {
    ...project,
    fanCoils: project.fanCoils?.map((u) => (u.id === id ? next : u)),
  };
}
export function removeFanCoil(project: Project, id: string): Project {
  const unit = project.fanCoils?.find((u) => u.id === id);
  if (!unit) return project;
  if (unit.locked)
    throw new Error("Sbloccare il ventilconvettore prima di rimuoverlo.");
  const fanCoils = project.fanCoils?.filter((u) => u.id !== id);
  return removeEmptiedInstallations(
    {
      ...project,
      fanCoils,
      rooms: project.rooms.map((r) =>
        r.id === unit.roomId &&
        r.systemType === "fanCoil" &&
        !fanCoils?.some((u) => u.roomId === r.id)
          ? {
              ...r,
              systemType:
                project.hvacSystems.find((s) => s.roomIds.includes(r.id))
                  ?.type ??
                (project.radiators.some((u) => u.roomId === r.id)
                  ? "radiator"
                  : "none"),
            }
          : r,
      ),
    },
    project,
  );
}
