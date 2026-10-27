import type { Plenum, Point, Project } from "@/schemas/project";
import { newId } from "../project";
import { roomCeilingHeightM } from "../air-conditioning/elevation";
import { roofHeightAt } from "../geometry/ceilings";
import { resolveTerminalAccessorySpecification } from "../air-terminals/commercial-bom";
import {
  machinePlenum,
  machinePlenums,
  placedPlenumGeometry,
} from "./placement";
import { calculatePlenum } from "./plenum";
import { ductedMachineElevationM, ductedMachineForDevice } from "./machine";
import { ensureFanCoilAirSystem } from "../fan-coils/air";
import { fanCoilProductAtVersion, isDuctedFanCoil } from "../catalogs/fan-coils";

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

/**
 * Plenum della bocchetta come elemento autonomo: nasce con le misure di
 * catalogo del terminale ma è un corpo separato, con posizione, rotazione,
 * materiale e stacchi propri. Il collegamento resta l'unico legame.
 */
export function addTerminalPlenum(
  project: Project,
  terminalId: string,
): Project {
  const terminal = project.airTerminals.find((t) => t.id === terminalId);
  if (!terminal)
    throw new Error(
      "Clicca una bocchetta configurata per creare il suo plenum.",
    );
  if (terminal.locked)
    throw new Error("Sblocca la bocchetta prima di aggiungere il plenum.");
  if (project.plenums.some((p) => p.attachmentId === terminal.id))
    throw new Error("La bocchetta ha già un plenum collegato.");
  const body = catalogueTerminalPlenum(project, terminal);
  if (!body)
    throw new Error(
      "La bocchetta non ha un plenum di catalogo: verifica famiglia e misura nella scheda Bocchetta.",
    );
  const plenum: Plenum = { ...body, id: newId(), status: "proposed" };
  return syncAttachedPlenums({
    ...project,
    plenums: [...project.plenums, plenum],
    airTerminals: project.airTerminals.map((t) =>
      t.id === terminal.id ? { ...t, plenumId: plenum.id } : t,
    ),
  });
}

export function connectPlenum(
  project: Project,
  plenumId: string,
  ownerId: string,
): Project {
  const fanCoil = project.fanCoils?.find((unit) => unit.id === ownerId);
  if (fanCoil && !ductedMachineForDevice(project, ownerId)) {
    if (!isDuctedFanCoil(fanCoilProductAtVersion(fanCoil.productId, fanCoil.catalogVersion)))
      throw new Error("Il ventilconvettore non è canalizzabile.");
    if (fanCoil.locked) throw new Error("Sblocca gli elementi prima di collegarli.");
    project = ensureFanCoilAirSystem(project, ownerId).project;
  }
  const plenum = project.plenums.find((p) => p.id === plenumId);
  const terminal = project.airTerminals.find((t) => t.id === ownerId);
  const machine = ductedMachineForDevice(project, ownerId);
  const system = machine?.system;
  const owner = terminal ?? machine?.unit;
  if (
    !plenum ||
    !owner ||
    owner.floorId !== plenum.floorId ||
    (terminal && terminal.use !== "supply")
  )
    throw new Error(
      "Collega il plenum a una bocchetta di mandata o a una macchina di ripresa sullo stesso piano.",
    );
  if (plenum.locked || owner.locked || machine?.locked)
    throw new Error("Sblocca gli elementi prima di collegarli.");
  const attached = project.plenums.filter(
    (p) => p.id !== plenumId && p.attachmentId === ownerId,
  );
  if (terminal && attached.length)
    throw new Error("La bocchetta ha già un plenum collegato.");
  // La macchina ha al massimo due plenum, uno per lato: anche un plenum
  // storico (senza attachmentId) occupa il proprio lato. La ripresa non è
  // obbligatoria, ma il terzo plenum non si crea.
  let use = terminal ? ("supply" as const) : plenum.use;
  if (!terminal) {
    const existing = machinePlenums(project, system!.id).filter(
      (item) => item.id !== plenumId,
    );
    if (existing.length >= 2)
      throw new Error("La macchina ha già i plenum di mandata e di ripresa.");
    if (existing.some((item) => item.use === use)) {
      const free = use === "supply" ? ("return" as const) : ("supply" as const);
      if (existing.some((item) => item.use === free))
        throw new Error("La macchina ha già i plenum di mandata e di ripresa.");
      use = free;
    }
  }
  const next: Project = {
    ...project,
    plenums: project.plenums.map((p) =>
      p.id === plenumId
        ? {
            ...p,
            attachmentId: owner.id,
            systemId: terminal ? terminal.systemId : system!.id,
            use,
            // Sulla macchina il plenum si appoggia esattamente alla bocca:
            // la posa si ricalcola dal titolare, non resta dove era stato messo.
            ...(!terminal
              ? {
                  widthMm: owner.widthMm,
                  heightMm: owner.heightMm,
                  status: "proposed" as const,
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

type AttachmentOwner = {
  systemId: string | null;
  elevationM?: number | null;
  position: Point;
  rotation: number;
  roomId: string;
  floorId: string;
};

/** Bocchetta o macchina a cui il plenum è agganciato. */
function attachmentOwner(
  project: Project,
  plenum: Plenum,
): AttachmentOwner | undefined {
  if (plenum.attachmentId) {
    const terminal = project.airTerminals.find(
      (t) => t.id === plenum.attachmentId,
    );
    if (terminal) return terminal;
    const system = project.hvacSystems.find((s) =>
      s.indoorUnits.some((u) => u.id === plenum.attachmentId),
    );
    const unit = system?.indoorUnits.find((u) => u.id === plenum.attachmentId);
    if (unit)
      return {
        ...unit,
        systemId: system!.id,
        elevationM: ductedMachineElevationM(project, system!, unit),
      };
  }
  if (plenum.attachmentId !== undefined || !plenum.systemId) return undefined;
  const system = project.hvacSystems.find((s) => s.id === plenum.systemId);
  const unit = system?.indoorUnits[0];
  return unit
    ? {
        ...unit,
        systemId: system!.id,
        elevationM: ductedMachineElevationM(project, system!, unit),
      }
    : undefined;
}

/** Posa del plenum che segue il titolare conservando il distacco salvato. */
export function followAttachmentPose(
  plenum: Pick<Plenum, "position" | "rotation">,
  previous: Pick<AttachmentOwner, "position" | "rotation">,
  owner: Pick<AttachmentOwner, "position" | "rotation">,
): Pick<Plenum, "position" | "rotation"> {
  const angle = owner.rotation - previous.rotation;
  const dx = plenum.position.x - previous.position.x;
  const dy = plenum.position.y - previous.position.y;
  return {
    rotation: plenum.rotation + angle,
    position: {
      x: owner.position.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: owner.position.y + dx * Math.sin(angle) + dy * Math.cos(angle),
    },
  };
}

/** Lati macchina (sistema e uso) il cui plenum è stato eliminato. */
export function removedMachineSides(
  project: Project,
  previous: Project,
): Set<string> {
  return new Set(
    previous.plenums
      .filter(
        (pl) =>
          pl.systemId &&
          !project.plenums.some((p) => p.id === pl.id) &&
          !previous.airTerminals.some((t) => t.id === pl.attachmentId),
      )
      .map((pl) => `${pl.systemId}:${pl.use}`),
  );
}

/** Recompute attachment poses from their owner at every command and 3D preview. */
export function syncAttachedPlenums(
  project: Project,
  previous?: Project,
  removedSides?: ReadonlySet<string>,
): Project {
  const plenums = project.plenums.flatMap((plenum): Plenum[] => {
    const saved = previous?.plenums.find((p) => p.id === plenum.id);
    const oldOwner = saved ? attachmentOwner(previous!, saved) : undefined;
    const owner = attachmentOwner(project, plenum);
    const terminalOwner =
      !!plenum.attachmentId &&
      project.airTerminals.some((t) => t.id === plenum.attachmentId);
    // Agganciato come il plenum della macchina: conserva il distacco scelto,
    // ma segue spostamenti e rotazioni del titolare. La sola proposta iniziale
    // usa la posa di catalogo calcolata qui sotto.
    if (
      saved &&
      oldOwner &&
      owner &&
      (plenum.attachmentId === undefined ||
        !terminalOwner ||
        plenum.status !== "proposed")
    ) {
      // Il comando puo aver gia seguito il titolare (rotateDevice90 sincronizza
      // al suo interno): non applicare due volte lo stesso spostamento.
      const followed = followAttachmentPose(plenum, oldOwner, owner);
      const expected = followAttachmentPose(saved, oldOwner, owner);
      const already =
        Math.abs(plenum.rotation - expected.rotation) < 1e-9 &&
        Math.abs(plenum.position.x - expected.position.x) < 1e-9 &&
        Math.abs(plenum.position.y - expected.position.y) < 1e-9;
      return [
        {
          ...plenum,
          systemId: owner.systemId,
          roomId: owner.roomId,
          floorId: owner.floorId,
          ...(already ? {} : followed),
          // Una quota modificata esplicitamente nel comando prevale sul seguito.
          ...(saved.elevationM != null &&
          plenum.elevationM === saved.elevationM &&
          oldOwner.elevationM != null &&
          owner.elevationM != null
            ? {
                elevationM:
                  saved.elevationM + owner.elevationM - oldOwner.elevationM,
              }
            : {}),
        },
      ];
    }
    if (!plenum.attachmentId) return [plenum];
    if (
      !project.airTerminals.some((t) => t.id === plenum.attachmentId) &&
      !project.hvacSystems.some((s) =>
        s.indoorUnits.some((u) => u.id === plenum.attachmentId),
      )
    )
      return [];
    // Senza la posa precedente il plenum gia posizionato resta dov'e:
    // aggiorna solo il legame con il titolare.
    if (plenum.status !== "proposed") {
      const terminal = project.airTerminals.find(
        (t) => t.id === plenum.attachmentId,
      );
      const system = project.hvacSystems.find((s) =>
        s.indoorUnits.some((u) => u.id === plenum.attachmentId),
      );
      const owner =
        terminal ??
        system?.indoorUnits.find((u) => u.id === plenum.attachmentId);
      return owner
        ? [
            {
              ...plenum,
              systemId: terminal ? terminal.systemId : (system?.id ?? null),
              floorId: owner.floorId,
              roomId: owner.roomId,
            },
          ]
        : [];
    }
    const placed = attachedPlenumPose(project, plenum);
    return placed ? [placed] : [];
  });
  const posed = { ...project, plenums };
  // Lato macchina eliminato in questa modifica: i rami non si ricreano,
  // altrimenti restano appesi nel vuoto.
  const removed =
    removedSides ??
    (previous ? removedMachineSides(project, previous) : new Set<string>());
  for (let i = 0; i < plenums.length; i++) {
    const plenum = plenums[i];
    if (plenum.attachmentId === undefined && plenum.systemId)
      plenums[i] = machinePlenum(posed, plenum.systemId, plenum.use) ?? plenum;
  }
  const ducts = (project.ducts ?? [])
    .filter((d) => {
      const terminal = project.airTerminals.find((t) => t.id === d.terminalId);
      if (
        terminal?.systemId &&
        removed.has(`${terminal.systemId}:${terminal.use}`)
      )
        return false;
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
    if (removed.has(`${plenum.systemId}:${terminal.use}`)) continue;
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
  for (const plenum of plenums.filter((p) => p.attachmentId === undefined)) {
    const geometry = placedPlenumGeometry(posed, plenum);
    if (!geometry) continue;
    const branches = geometry.ports.flatMap((port) =>
      port.branch.terminalIds.map((terminalId) => ({ port, terminalId })),
    );
    for (let i = ducts.length - 1; i >= 0; i--) {
      const duct = ducts[i];
      if (
        duct.plenumId === plenum.id &&
        duct.terminalId &&
        !branches.some(
          ({ port, terminalId }) =>
            terminalId === duct.terminalId && port.branch.id === duct.branchId,
        )
      )
        ducts.splice(i, 1);
    }
    for (const { port, terminalId } of branches) {
      const terminal = project.airTerminals.find((t) => t.id === terminalId);
      if (
        !terminal ||
        terminal.plenumId !== plenum.id ||
        !terminalPlenum(posed, terminal)
      )
        continue;
      const duct = ducts.find(
        (d) =>
          d.plenumId === plenum.id &&
          d.terminalId === terminalId &&
          d.branchId === port.branch.id,
      );
      if (duct) {
        if (duct.kind === "flexible") duct.diameterMm = port.diameterMm;
      } else
        ducts.push({
          id: newId(),
          systemId: plenum.systemId!,
          plenumId: plenum.id,
          terminalId,
          branchId: port.branch.id,
          kind: "flexible",
          shape: "circle",
          diameterMm: port.diameterMm,
          widthMm: null,
          heightMm: null,
          routing: "orthogonal",
          waypoints: [],
          decisionOrigin: "suggested",
          locked: false,
        });
    }
  }
  return {
    ...project,
    plenums,
    ducts,
    airTerminals: project.airTerminals.map((t) =>
      t.plenumId && !plenums.some((p) => p.id === t.plenumId)
        ? { ...t, plenumId: null }
        : t,
    ),
  };
}

export type PlenumConnectionSide =
  "left" | "right" | "rear" | "front" | "top" | "bottom";

function normalizedSide(
  position:
    | "lateral"
    | "upper"
    | "lower"
    | "rear"
    | "front"
    | "left"
    | "right"
    | "custom",
): PlenumConnectionSide {
  return position === "upper"
    ? "top"
    : position === "lower"
      ? "bottom"
      : position === "left"
        ? "left"
        : position === "right"
          ? "right"
          : position === "front"
            ? "front"
            : "rear";
}

/** Lato del corpo su cui arriva lo stacco numero portIndex. */
export function plenumConnectionSide(
  project: Project,
  plenum: Plenum,
  portIndex = 0,
): PlenumConnectionSide {
  const terminal = project.airTerminals.find(
    (t) => t.id === plenum.attachmentId,
  );
  const position =
    plenum.connectionPositions?.[portIndex] ??
    plenum.connectionPosition ??
    (terminal
      ? resolveTerminalAccessorySpecification(terminal)?.plenum
          ?.connectionPosition
      : undefined) ??
    (terminal?.mounting === "ceiling" ? "upper" : "lateral");
  return normalizedSide(position);
}

/** Posizione locale dello stacco sul corpo, in metri. */
export function plenumPortLocal(
  plenum: Pick<Plenum, "widthMm" | "heightMm" | "depthMm">,
  side: PlenumConnectionSide,
  ordinal: number,
  total: number,
  lead = 0.06,
) {
  const fraction = total > 1 ? (ordinal + 0.5) / total - 0.5 : 0;
  const halfWidth = plenum.widthMm / 2000;
  const halfDepth = plenum.depthMm / 2000;
  const halfHeight = plenum.heightMm / 2000;
  return side === "top"
    ? { x: fraction * (plenum.widthMm / 1000), y: 0, z: halfHeight + lead }
    : side === "bottom"
      ? {
          x: fraction * (plenum.widthMm / 1000),
          y: 0,
          z: -halfHeight - lead,
        }
      : side === "left"
        ? {
            x: -halfWidth - lead,
            y: fraction * (plenum.depthMm / 1000),
            z: 0,
          }
        : side === "right"
          ? {
              x: halfWidth + lead,
              y: fraction * (plenum.depthMm / 1000),
              z: 0,
            }
          : side === "front"
            ? {
                x: fraction * (plenum.widthMm / 1000),
                y: halfDepth + lead,
                z: 0,
              }
            : {
                x: fraction * (plenum.widthMm / 1000),
                y: -halfDepth - lead,
                z: 0,
              };
}

export function attachedPlenumPorts(project: Project, plenum: Plenum) {
  const count = plenum.portCount ?? 1;
  const diameter = plenum.portDiameterMm ?? 160;
  const sides = Array.from({ length: count }, (_, i) =>
    plenumConnectionSide(project, plenum, i),
  );
  const totals: Record<string, number> = {};
  for (const side of sides) totals[side] = (totals[side] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return sides.map((side) => {
    const ordinal = seen[side] ?? 0;
    seen[side] = ordinal + 1;
    const local = plenumPortLocal(plenum, side, ordinal, totals[side]);
    return {
      x:
        plenum.position.x +
        local.x * Math.cos(plenum.rotation) -
        local.y * Math.sin(plenum.rotation),
      y:
        plenum.position.y +
        local.x * Math.sin(plenum.rotation) +
        local.y * Math.cos(plenum.rotation),
      elevationM: (plenum.elevationM ?? 2) + local.z,
      diameterMm: diameter,
    };
  });
}

/**
 * Un plenum esiste nel modello solo quando è un corpo salvato e collegato:
 * la bocchetta non ha un plenum implicito.
 */
export function terminalPlenum(
  project: Project,
  terminal: Project["airTerminals"][number],
): Plenum | null {
  const saved = project.plenums.find((p) => p.attachmentId === terminal.id);
  if (!saved) return null;
  // La proposta usa la posa di catalogo calcolata; una volta spostato, il
  // plenum salva il distacco dal titolare e syncAttachedPlenums lo aggiorna.
  return saved.status === "proposed"
    ? (attachedPlenumPose(project, saved) ?? saved)
    : saved;
}

/** Corpo di catalogo usato alla creazione: da lì il plenum conserva il distacco. */
function catalogueTerminalPlenum(
  project: Project,
  terminal: Project["airTerminals"][number],
): Plenum | null {
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
    material: "insulated",
    connectionPosition: spec.connectionPosition,
    shape: "rectangular",
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
  if (system) {
    const geometry = calculatePlenum(
      project,
      system.id,
      plenum.use,
    ).machineGeometry;
    const depthMm = geometry?.totalDepthMm ?? plenum.depthMm;
    const gap = (owner.depthMm! + depthMm) / 2000;
    const rotation = owner.rotation + (plenum.use === "return" ? Math.PI : 0);
    return {
      ...plenum,
      systemId: system.id,
      roomId: owner.roomId,
      floorId: owner.floorId,
      rotation,
      widthMm: geometry?.bodyWidthMm ?? owner.widthMm,
      heightMm: geometry?.bodyHeightMm ?? owner.heightMm,
      depthMm,
      position: {
        x: owner.position.x - Math.sin(rotation) * gap,
        y: owner.position.y + Math.cos(rotation) * gap,
      },
      elevationM: ductedMachineElevationM(
        project,
        system,
        system.indoorUnits.find((u) => u.id === plenum.attachmentId)!,
      ),
    };
  }
  const face = terminal?.elevationM ?? roomCeilingHeightM(room);
  const roof = roofHeightAt(project, room, owner.position);
  const height = plenum.heightMm / 1000;
  // Senza vuoto sopra la faccia (solaio a filo) il corpo non ci sta: scende di
  // fianco alla bocchetta invece di attraversare il solaio.
  const inVoid = face + (terminal?.depthMm ?? 0) / 1000 + height <= roof + 1e-9;
  const gap =
    (ceiling ? (terminal?.heightMm ?? 0) : (owner.depthMm ?? 0)) / 2000 +
    plenum.depthMm / 2000;
  return {
    ...plenum,
    systemId: terminal ? terminal.systemId : system!.id,
    roomId: owner.roomId,
    floorId: owner.floorId,
    rotation: owner.rotation,
    ...(!terminal ? { widthMm: owner.widthMm, heightMm: owner.heightMm } : {}),
    position:
      ceiling && inVoid
        ? owner.position
        : {
            x: owner.position.x + Math.sin(owner.rotation) * gap,
            y: owner.position.y - Math.cos(owner.rotation) * gap,
          },
    elevationM: terminal
      ? ceiling
        ? Math.min(face + (terminal.depthMm ?? 0) / 1000 + height, roof) -
          height / 2
        : face
      : room.heightM - owner.heightMm / 2000 - 0.05,
  };
}
