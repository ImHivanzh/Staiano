import type { Plenum, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { pointInPolygon } from "@/domain/geometry/primitives";
import { calculatePlenum } from "./plenum";
import { ductedMachineElevationM, ductedMachineForDevice } from "./machine";

export function placeDuctedMachine(
  project: Project,
  systemId: string,
  roomId?: string,
): Project {
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  const room = project.rooms.find(
    (r) => r.id === (roomId ?? system?.roomIds[0]),
  );
  if (
    !system ||
    !room ||
    room.conditioningExclusion ||
    room.geometryStatus !== "closed" ||
    !project.floors.find((floor) => floor.id === room.floorId)?.scaleVerified
  )
    throw new Error("Stanza valida con scala verificata necessaria.");
  const product = hvacProductAtVersion(system.productId, system.catalogVersion);
  const dims = system.genericMachine ?? product;
  if (!dims?.widthMm || !dims.heightMm || !dims.depthMm)
    throw new Error(
      "Ingombro macchina non disponibile: inserire le dimensioni reali della macchina manuale.",
    );
  const existing = system.indoorUnits[0];
  const machine = {
    id: existing?.id ?? newId(),
    roomId: room.id,
    floorId: room.floorId,
    wallId: null,
    position: existing?.roomId === room.id ? existing.position : room.centroid,
    rotation: existing?.rotation ?? 0,
    widthMm: dims.widthMm,
    heightMm: dims.heightMm,
    depthMm: dims.depthMm,
    productId: system.productId,
    catalogVersion: system.catalogVersion,
    locked: existing?.locked ?? false,
  };
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === systemId ? { ...s, indoorUnits: [machine] } : s,
    ),
  };
}

/**
 * Plenum della macchina: al massimo uno di mandata e uno di ripresa, anche se
 * storici (senza attachmentId) o collegati direttamente all'unità interna.
 */
export function machinePlenums(project: Project, systemId: string): Plenum[] {
  const system = project.hvacSystems.find(
    (item) => item.id === systemId && item.type === "ducted",
  );
  if (!system) return [];
  return project.plenums.filter(
    (plenum) =>
      plenum.systemId === systemId &&
      (plenum.attachmentId === undefined ||
        plenum.attachmentId === null ||
        system.indoorUnits.some((unit) => unit.id === plenum.attachmentId)),
  );
}

/** Lati con bocchette collegate ma senza plenum salvato davanti alla macchina: i flessibili restano agganciati in aria. */
export function missingMachinePlenums(
  project: Project,
  systemId: string,
): Array<"supply" | "return"> {
  const saved = machinePlenums(project, systemId);
  return (["supply", "return"] as const).filter(
    (use) =>
      !saved.some((plenum) => plenum.use === use) &&
      project.airTerminals.some(
        (terminal) =>
          terminal.systemId === systemId &&
          terminal.use === use &&
          (terminal.plenumId ||
            (project.ducts ?? []).some(
              (duct) => duct.terminalId === terminal.id,
            )),
      ),
  );
}

/** Create a dedicated saved plenum, never shared with a second autonomous machine. */
export function placePlenum(
  project: Project,
  systemId: string,
  use: "supply" | "return" = "supply",
): Project {
  const existing = machinePlenums(project, systemId);
  if (existing.some((plenum) => plenum.use === use)) return project;
  if (existing.length >= 2)
    throw new Error("La macchina ha già i plenum di mandata e di ripresa.");
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  if (!system) throw new Error("Macchina inesistente.");
  const next = system.indoorUnits.length
    ? project
    : placeDuctedMachine(project, systemId);
  const proposed = machinePlenum(next, systemId, use);
  if (!proposed)
    throw new Error(
      use === "supply"
        ? "Attacco macchina e stacchi verificati necessari. Nessuna geometria del plenum inventata."
        : "Raccordo di ripresa della macchina non dichiarato: inserisci larghezza e altezza dell’attacco prima di creare il plenum.",
    );
  const plenum = { ...proposed, id: newId() };
  // Il plenum macchina è un corpo a sé: non riassegna la bocchetta.
  return {
    ...next,
    plenums: [...next.plenums, plenum],
  };
}

export function placeSupplyPlenum(project: Project, systemId: string) {
  return placePlenum(project, systemId, "supply");
}

/** The insertion tool accepts a configured machine, never an arbitrary plan point. */
export function addMachinePlenum(project: Project, machineId: string): Project {
  const resolved = ductedMachineForDevice(project, machineId);
  if (!resolved)
    throw new Error(
      "Clicca una macchina configurata per aggiungere il suo plenum.",
    );
  const { system } = resolved;
  if (resolved.locked)
    throw new Error("Sblocca la macchina prima di aggiungere il plenum.");
  const existing = machinePlenums(project, system.id);
  if (existing.length >= 2)
    throw new Error("La macchina ha già i plenum di mandata e di ripresa.");
  return placePlenum(
    project,
    system.id,
    existing.some((p) => p.use === "supply") ? "return" : "supply",
  );
}

export function moveSystemObject(
  project: Project,
  id: string,
  position: Point,
): Project {
  if (![position.x, position.y].every(Number.isFinite))
    throw new Error("Posizione non valida.");
  const plenum = project.plenums.find((pl) => pl.id === id);
  const system = project.hvacSystems.find(
    (s) => s.type === "ducted" && s.indoorUnits.some((u) => u.id === id),
  );
  const item = plenum ?? system?.indoorUnits.find((u) => u.id === id);
  if (!item) return project;
  if (item.locked) throw new Error("Sbloccare l’elemento prima di spostarlo.");
  if (plenum)
    return {
      ...project,
      plenums: project.plenums.map((pl) =>
        pl.id === id ? { ...pl, position, status: "manual" } : pl,
      ),
    };
  const room = project.rooms.find(
    (r) =>
      r.floorId === item.floorId &&
      !r.conditioningExclusion &&
      pointInPolygon(position, r.polygon),
  );
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === system!.id
        ? {
            ...s,
            indoorUnits: s.indoorUnits.map((u) =>
              u.id === id
                ? { ...u, position, roomId: room?.id ?? u.roomId }
                : u,
            ),
          }
        : s,
    ),
  };
}

/** The same saved dimensions and real outlet list feed 3D and dossier views. */
export function placedPlenumGeometry(project: Project, plenum: Plenum) {
  if (
    !plenum.systemId ||
    (plenum.attachmentId != null &&
      !project.hvacSystems.some(
        (s) =>
          s.id === plenum.systemId &&
          s.indoorUnits.some((u) => u.id === plenum.attachmentId),
      ))
  )
    return null;
  const calculated = calculatePlenum(
    project,
    plenum.systemId,
    plenum.use,
  ).machineGeometry;
  if (
    !calculated?.inlet ||
    !calculated.bodyWidthMm ||
    !calculated.bodyHeightMm ||
    !calculated.totalDepthMm
  )
    return null;
  const transition = Math.min(
    calculated.transitionDepthMm ?? 0,
    plenum.depthMm,
  );
  const collar = calculated.settings.collarLengthMm;
  const boxDepth = Math.max(0, plenum.depthMm - transition - collar);
  return {
    ...calculated,
    bodyWidthMm: plenum.widthMm,
    bodyHeightMm: plenum.heightMm,
    transitionDepthMm: transition,
    boxDepthMm: boxDepth,
    totalDepthMm: plenum.depthMm,
    ports: calculated.ports.map((port) => ({
      ...port,
      centerMm: [port.centerMm[0], port.centerMm[1], transition + boxDepth] as [
        number,
        number,
        number,
      ],
    })),
  };
}

/** Saved or catalogue-sized body, shared by the channel view and its endpoints. */
export function machinePlenum(
  project: Project,
  systemId: string,
  use: "supply" | "return",
): Plenum | null {
  const saved = project.plenums.find(
    (p) =>
      p.systemId === systemId &&
      p.use === use &&
      (p.attachmentId === undefined ||
        project.hvacSystems
          .find((s) => s.id === systemId)
          ?.indoorUnits.some((u) => u.id === p.attachmentId)),
  );
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  const machine = system?.indoorUnits[0];
  if (!machine) return null;
  const result = calculatePlenum(project, systemId, use);
  const geometry = result.machineGeometry;
  if (
    !geometry?.bodyWidthMm ||
    !geometry.bodyHeightMm ||
    !geometry.totalDepthMm
  )
    return saved ?? null;
  // La mandata esce davanti alla macchina; la ripresa sta dietro, con la
  // transizione rivolta verso l'attacco della macchina.
  const forward =
    use === "supply"
      ? { x: -Math.sin(machine.rotation), y: Math.cos(machine.rotation) }
      : { x: Math.sin(machine.rotation), y: -Math.cos(machine.rotation) };
  const gap = (machine.depthMm + geometry.totalDepthMm) / 2000;
  const plenum: Plenum = {
    id: `machine-plenum:${systemId}:${use}`,
    systemId,
    use,
    floorId: machine.floorId,
    roomId: machine.roomId,
    position: {
      x: machine.position.x + forward.x * gap,
      y: machine.position.y + forward.y * gap,
    },
    rotation: use === "supply" ? machine.rotation : machine.rotation + Math.PI,
    widthMm: geometry.bodyWidthMm,
    heightMm: geometry.bodyHeightMm,
    depthMm: geometry.totalDepthMm,
    elevationM: ductedMachineElevationM(project, system!, machine),
    model: `${use === "supply" ? "Mandata" : "Ripresa"} su misura / ${result.machineModel ?? system.productId}`,
    status: "proposed",
    locked: false,
    designSettings: geometry.settings,
  };
  return saved
    ? saved.status === "proposed"
      ? { ...saved, ...plenum, id: saved.id, locked: saved.locked }
      : saved
    : plenum;
}
