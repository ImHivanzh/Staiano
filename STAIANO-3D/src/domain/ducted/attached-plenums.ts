import type { Plenum, Point, Project } from "@/schemas/project";
import { newId } from "../project";
import { roomCeilingHeightM } from "../air-conditioning/elevation";
import { resolveTerminalAccessorySpecification } from "../air-terminals/commercial-bom";

export function insertPlenum(
  project: Project,
  roomId: string,
  position: Point,
): Project {
  const room = project.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error("Inserisci il plenum in una stanza.");
  return {
    ...project,
    plenums: [
      ...project.plenums,
      {
        id: newId(),
        systemId: null,
        attachmentId: null,
        use: "supply",
        floorId: room.floorId,
        roomId,
        position,
        rotation: 0,
        widthMm: 600,
        heightMm: 200,
        depthMm: 200,
        elevationM: roomCeilingHeightM(room) + 0.1,
        portCount: 1,
        portDiameterMm: 160,
        material: "insulated",
        status: "manual",
        locked: false,
        designSettings: null,
        model: "Plenum su misura",
      },
    ],
  };
}

export function connectPlenum(
  project: Project,
  plenumId: string,
  ownerId: string,
): Project {
  const plenum = project.plenums.find((p) => p.id === plenumId);
  const terminal = project.airTerminals.find((t) => t.id === ownerId);
  const system = project.hvacSystems.find(
    (s) => s.type === "ducted" && s.indoorUnits.some((u) => u.id === ownerId),
  );
  const owner = terminal ?? system?.indoorUnits.find((u) => u.id === ownerId);
  if (
    !plenum ||
    !owner ||
    owner.floorId !== plenum.floorId ||
    (terminal && terminal.use !== "supply")
  )
    throw new Error(
      "Collega il plenum a una bocchetta di mandata o a una macchina di ripresa sullo stesso piano.",
    );
  if (plenum.locked || owner.locked)
    throw new Error("Sblocca gli elementi prima di collegarli.");
  if (
    project.plenums.some((p) => p.id !== plenumId && p.attachmentId === ownerId)
  )
    throw new Error("L’elemento ha già un plenum collegato.");
  const published = terminal
    ? resolveTerminalAccessorySpecification(terminal)?.plenum
    : null;
  const next: Project = {
    ...project,
    plenums: project.plenums.map((p) =>
      p.id === plenumId
        ? {
            ...p,
            attachmentId: ownerId,
            systemId: terminal ? terminal.systemId : system!.id,
            use: terminal ? "supply" : "return",
            ...(!terminal
              ? { widthMm: owner.widthMm, heightMm: owner.heightMm }
              : {}),
            ...(published
              ? {
                  widthMm: published.lengthMm ?? terminal!.widthMm,
                  heightMm: published.heightMm ?? p.heightMm,
                  depthMm: published.widthMm ?? p.depthMm,
                  portCount: published.portCount,
                  portDiameterMm: published.portDiameterMm,
                  model: published.modelCode,
                }
              : {}),
          }
        : p,
    ),
    airTerminals: project.airTerminals.map((t) =>
      t.id === terminal?.id
        ? { ...t, plenumId }
        : t.plenumId === plenumId
          ? { ...t, plenumId: null }
          : t,
    ),
    ducts: project.ducts?.filter((d) => d.plenumId !== plenumId),
  };
  return syncAttachedPlenums(next);
}

/** Recompute attachment poses from their owner at every command and 3D preview. */
export function syncAttachedPlenums(
  project: Project,
  previous?: Project,
): Project {
  const plenums = project.plenums.flatMap((plenum): Plenum[] => {
    if (plenum.attachmentId === undefined && previous) {
      const old = previous.hvacSystems.find((s) => s.id === plenum.systemId)
        ?.indoorUnits[0];
      const owner = project.hvacSystems.find((s) => s.id === plenum.systemId)
        ?.indoorUnits[0];
      const saved = previous.plenums.find((p) => p.id === plenum.id);
      if (old && owner && saved) {
        const angle = owner.rotation - old.rotation;
        const dx = saved.position.x - old.position.x,
          dy = saved.position.y - old.position.y;
        return [
          {
            ...plenum,
            roomId: owner.roomId,
            rotation: saved.rotation + angle,
            position: {
              x: owner.position.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: owner.position.y + dx * Math.sin(angle) + dy * Math.cos(angle),
            },
          },
        ];
      }
    }
    if (!plenum.attachmentId) return [plenum];
    const placed = attachedPlenumPose(project, plenum);
    return placed ? [placed] : [];
  });
  const ducts = (project.ducts ?? [])
    .filter((d) => {
      const plenum = plenums.find((p) => p.id === d.plenumId);
      return (
        !!plenum &&
        (plenum.attachmentId === undefined ||
          (plenum.systemId === d.systemId &&
            (!d.terminalId ||
              project.airTerminals.some(
                (t) => t.id === d.terminalId && t.systemId === d.systemId,
              )) &&
            Number(d.branchId?.split(":").at(-1) ?? 0) <
              (plenum.portCount ?? 1)))
      );
    })
    .map((d) => ({ ...d }));
  for (const plenum of plenums) {
    const terminal = project.airTerminals.find(
      (t) => t.id === plenum.attachmentId,
    );
    if (!terminal || !terminal.systemId || !plenum.systemId) continue;
    for (let i = 0; i < (plenum.portCount ?? 1); i++) {
      const branchId = `${plenum.id}:${i}`;
      const existing = ducts.find(
        (d) => d.plenumId === plenum.id && d.branchId === branchId,
      );
      if (existing) {
        if (existing.kind === "flexible")
          existing.diameterMm = plenum.portDiameterMm ?? 160;
        continue;
      }
      ducts.push({
        id: newId(),
        systemId: plenum.systemId,
        plenumId: plenum.id,
        terminalId: terminal.id,
        branchId,
        kind: "flexible",
        shape: "circle",
        diameterMm: plenum.portDiameterMm ?? 160,
        widthMm: null,
        heightMm: null,
        routing: "orthogonal",
        waypoints: [],
        decisionOrigin: "suggested",
        locked: false,
      });
    }
  }
  return { ...project, plenums, ducts };
}

export function attachedPlenumPorts(project: Project, plenum: Plenum) {
  const upper = plenumPortsUpper(project, plenum);
  const count = plenum.portCount ?? 1;
  const diameter = plenum.portDiameterMm ?? 160;
  return Array.from({ length: count }, (_, i) => {
    const along = (((i + 0.5) / count - 0.5) * plenum.widthMm) / 1000;
    const forward = upper ? 0 : -plenum.depthMm / 2000 - 0.06;
    return {
      x:
        plenum.position.x +
        along * Math.cos(plenum.rotation) -
        forward * Math.sin(plenum.rotation),
      y:
        plenum.position.y +
        along * Math.sin(plenum.rotation) +
        forward * Math.cos(plenum.rotation),
      elevationM:
        (plenum.elevationM ?? 2) + (upper ? plenum.heightMm / 2000 + 0.06 : 0),
      diameterMm: diameter,
    };
  });
}

export function plenumPortsUpper(project: Project, plenum: Plenum) {
  const terminal = project.airTerminals.find(
    (t) => t.id === plenum.attachmentId,
  );
  return (
    !!terminal &&
    (terminal.commercialOptions?.connectionPosition ??
      resolveTerminalAccessorySpecification(terminal)?.plenum
        ?.connectionPosition ??
      (terminal.mounting === "ceiling" ? "upper" : "lateral")) === "upper"
  );
}

/** Catalogue plenums are rendered even when no separate custom body was inserted. */
export function terminalPlenum(
  project: Project,
  terminal: Project["airTerminals"][number],
): Plenum | null {
  const saved = project.plenums.find((p) => p.attachmentId === terminal.id);
  if (saved) return attachedPlenumPose(project, saved);
  if (terminal.commercialOptions?.insulatedPlenum === false) return null;
  const spec = resolveTerminalAccessorySpecification(terminal)?.plenum;
  if (!spec?.lengthMm || !spec.widthMm || !spec.heightMm) return null;
  return attachedPlenumPose(project, {
    id: `terminal-plenum:${terminal.id}`,
    attachmentId: terminal.id,
    systemId: terminal.systemId,
    floorId: terminal.floorId,
    roomId: terminal.roomId,
    use: terminal.use,
    position: terminal.position,
    rotation: terminal.rotation,
    widthMm: spec.lengthMm,
    heightMm: spec.heightMm,
    depthMm: spec.widthMm,
    elevationM: terminal.elevationM ?? undefined,
    portCount: spec.portCount,
    portDiameterMm: spec.portDiameterMm,
    model: spec.modelCode,
    material: terminal.commercialOptions?.plenumMaterial ?? "insulated",
    status: "proposed",
    locked: terminal.locked,
    designSettings: null,
  });
}

function attachedPlenumPose(project: Project, plenum: Plenum): Plenum | null {
  const terminal = project.airTerminals.find(
    (t) => t.id === plenum.attachmentId,
  );
  const system = project.hvacSystems.find((s) =>
    s.indoorUnits.some((u) => u.id === plenum.attachmentId),
  );
  const owner =
    terminal ?? system?.indoorUnits.find((u) => u.id === plenum.attachmentId);
  if (!owner) return null;
  const room = project.rooms.find((r) => r.id === owner.roomId);
  if (!room) return null;
  const ceiling = terminal?.mounting === "ceiling";
  const gap = (owner.depthMm ?? 0) / 2000 + plenum.depthMm / 2000;
  return {
    ...plenum,
    systemId: terminal ? terminal.systemId : system!.id,
    roomId: owner.roomId,
    floorId: owner.floorId,
    rotation: owner.rotation,
    ...(!terminal ? { widthMm: owner.widthMm, heightMm: owner.heightMm } : {}),
    position: ceiling
      ? owner.position
      : {
          x: owner.position.x + Math.sin(owner.rotation) * gap,
          y: owner.position.y - Math.cos(owner.rotation) * gap,
        },
    elevationM: terminal
      ? (terminal.elevationM ?? roomCeilingHeightM(room)) +
        (ceiling ? (terminal.depthMm ?? 0) / 1000 + plenum.heightMm / 2000 : 0)
      : room.heightM - owner.heightMm / 2000 - 0.05,
  };
}
