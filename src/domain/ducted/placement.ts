import type { Plenum, Point, Project } from "@/schemas/project";
import { newId } from "@/domain/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { calculateSupplyPlenum } from "./plenum";

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
  if (!system || !room || !system.roomIds.includes(room.id))
    throw new Error("Stanza servita necessaria.");
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

/** Create a dedicated saved plenum, never shared with a second autonomous machine. */
export function placeSupplyPlenum(project: Project, systemId: string): Project {
  if (project.plenums.some((pl) => pl.systemId === systemId)) return project;
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  if (!system) throw new Error("Macchina inesistente.");
  let next = system.indoorUnits.length
    ? project
    : placeDuctedMachine(project, systemId);
  const machine = next.hvacSystems.find((s) => s.id === systemId)!
    .indoorUnits[0];
  const result = calculateSupplyPlenum(next, systemId);
  const geometry = result.machineGeometry;
  if (
    !geometry?.bodyWidthMm ||
    !geometry.bodyHeightMm ||
    !geometry.totalDepthMm
  )
    throw new Error(
      "Attacco macchina e stacchi verificati necessari. Nessuna geometria del plenum inventata.",
    );
  const forward = {
    x: -Math.sin(machine.rotation),
    y: Math.cos(machine.rotation),
  };
  const gap = (machine.depthMm + geometry.totalDepthMm) / 2000;
  const room = next.rooms.find((r) => r.id === machine.roomId)!;
  const plenum: Plenum = {
    id: newId(),
    systemId,
    floorId: machine.floorId,
    roomId: machine.roomId,
    position: {
      x: machine.position.x + forward.x * gap,
      y: machine.position.y + forward.y * gap,
    },
    rotation: machine.rotation,
    widthMm: geometry.bodyWidthMm,
    heightMm: geometry.bodyHeightMm,
    depthMm: geometry.totalDepthMm,
    elevationM:
      room.heightM -
      Math.max(machine.heightMm, geometry.bodyHeightMm) / 2000 -
      0.05,
    model: `Su misura / ${result.machineModel ?? system.productId}`,
    status: "proposed",
    locked: false,
    designSettings: geometry.settings,
  };
  next = {
    ...next,
    plenums: [...next.plenums, plenum],
    airTerminals: next.airTerminals.map((t) =>
      t.systemId === systemId && t.floorId === machine.floorId
        ? { ...t, plenumId: plenum.id }
        : t,
    ),
  };
  return next;
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
  return {
    ...project,
    hvacSystems: project.hvacSystems.map((s) =>
      s.id === system!.id
        ? {
            ...s,
            indoorUnits: s.indoorUnits.map((u) =>
              u.id === id ? { ...u, position } : u,
            ),
          }
        : s,
    ),
  };
}

/** The same saved dimensions and real outlet list feed 3D and dossier views. */
export function placedPlenumGeometry(project: Project, plenum: Plenum) {
  const calculated = calculateSupplyPlenum(
    project,
    plenum.systemId,
  ).machineGeometry;
  if (!calculated) return null;
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
