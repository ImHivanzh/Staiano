import { indoorUnitFitsBelowCeiling } from "../air-conditioning/elevation";
import type { Point, Project } from "@/schemas/project";
import { placeEquipmentDraft } from "./equipment-draft";
import { distance, projection, pointInPolygon } from "./primitives";
import { footprintInsideRoom, footprintCorners } from "./footprint";
import {
  positionAlongRoomWall,
  positionRecessedAlongRoomWall,
  roomWallSpan,
} from "./placement";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { snapTerminalPose } from "./terminal-snap";
import {
  ceilingFrontPose,
  ceilingHeightAt,
  minimumCeilingHeightM,
} from "./ceilings";
import type { SnapOptions } from "./primitives";
import { moveSystemObject } from "@/domain/ducted/placement";
import {
  moveHydronicOutdoorUnit,
  placeHeatPumpDraft,
} from "@/domain/hydronic/apply";
import { moveHvacOutdoorUnit } from "@/domain/air-conditioning/outdoor";
import {
  fanCoilProductAtVersion,
  isRecessedFanCoil,
} from "@/domain/catalogs/fan-coils";
import {
  fanCoilCeilingRange,
  fanCoilPlacementValid,
} from "@/domain/fan-coils/placement";
import {
  layoutLinearRun,
  linearRunMembers,
} from "@/domain/air-terminals/linear-run";
export function movePlacedDevice(
  project: Project,
  deviceId: string,
  target: Point,
  snap?: SnapOptions,
): Project {
  const equipmentDraft = project.equipmentDrafts?.find(
    (draft) => draft.id === deviceId,
  );
  if (equipmentDraft) {
    const room = project.rooms.find(
      (item) =>
        item.floorId === equipmentDraft.floorId &&
        !item.conditioningExclusion &&
        pointInPolygon(target, item.polygon),
    );
    return placeEquipmentDraft(
      project,
      room?.id ?? "",
      target,
      equipmentDraft.type,
      deviceId,
    );
  }
  const heatPumpDraft = project.heatPumpDrafts?.find(
    (draft) => draft.id === deviceId,
  );
  if (heatPumpDraft)
    return placeHeatPumpDraft(project, heatPumpDraft.floorId, target, deviceId);
  if (project.hydronicSystems?.some((s) => s.outdoorUnit.id === deviceId))
    return moveHydronicOutdoorUnit(project, deviceId, { position: target });
  if (project.hvacSystems.some((s) => s.outdoorUnit?.id === deviceId))
    return moveHvacOutdoorUnit(project, deviceId, { position: target });
  const pillar = project.pillars?.find((c) => c.id === deviceId);
  if (pillar) {
    if (pillar.locked)
      throw new Error("Sbloccare il pilastro prima di spostarlo.");
    return {
      ...project,
      pillars: project.pillars!.map((c) =>
        c.id === deviceId ? { ...c, position: target } : c,
      ),
    };
  }
  if (
    project.plenums.some((pl) => pl.id === deviceId) ||
    project.hvacSystems.some(
      (s) =>
        s.type === "ducted" && s.indoorUnits.some((u) => u.id === deviceId),
    )
  )
    return moveSystemObject(project, deviceId, target);
  const all = [
    ...project.radiators,
    ...(project.fanCoils ?? []),
    ...project.airTerminals,
    ...project.hvacSystems.flatMap((s) => s.indoorUnits),
  ];
  const item = all.find((d) => d.id === deviceId);
  if (!item) return project;
  const terminal = project.airTerminals.find((t) => t.id === deviceId);
  const members = terminal ? linearRunMembers(project, terminal) : [];
  if (terminal && members.length > 1) {
    if (members.some((member) => member.locked))
      throw new Error("Sbloccare tutti i moduli del punto prima di spostarlo.");
    const widthMm = members.reduce((sum, member) => sum + member.widthMm, 0);
    const offsetM = (widthMm - members[0].widthMm) / 2000;
    const center = {
      x: members[0].position.x + Math.cos(terminal.rotation) * offsetM,
      y: members[0].position.y + Math.sin(terminal.rotation) * offsetM,
    };
    const whole = {
      ...terminal,
      widthMm,
      position: center,
      heightMm: Math.max(...members.map((member) => member.heightMm)),
      commercialOptions: undefined,
    };
    const collapsed = {
      ...project,
      airTerminals: [
        ...project.airTerminals.filter(
          (t) => !members.some((member) => member.id === t.id),
        ),
        whole,
      ],
    };
    const moved = movePlacedDevice(
      collapsed,
      deviceId,
      {
        x: target.x + center.x - terminal.position.x,
        y: target.y + center.y - terminal.position.y,
      },
      snap,
    );
    const pose = moved.airTerminals.find((t) => t.id === deviceId)!;
    if (
      terminal.mounting === "ceiling" &&
      !footprintInsideRoom(
        project.rooms.find((room) => room.id === pose.roomId)!,
        pose.position,
        widthMm / 1000,
        whole.heightMm / 1000,
        pose.rotation,
      )
    )
      throw new Error(
        "Il punto composto non rientra nel contorno della stanza.",
      );
    const arranged = layoutLinearRun(members, pose);
    return {
      ...project,
      airTerminals: project.airTerminals.map(
        (t) => arranged.find((member) => member.id === t.id) ?? t,
      ),
    };
  }
  const fanCoil = project.fanCoils?.find((t) => t.id === deviceId);
  const fanCoilProduct = fanCoil
    ? fanCoilProductAtVersion(fanCoil.productId, fanCoil.catalogVersion)
    : null;
  const recessedFanCoil =
    !!fanCoil && fanCoil.mounting === "wall" && isRecessedFanCoil(fanCoilProduct);
  if (item.locked)
    throw new Error("Sbloccare l’apparecchio prima di spostarlo.");
  if (terminal && needsTerminalReconfiguration(terminal))
    throw new Error(
      "Terminale legacy: riconfigurare il montaggio nella stanza prima di spostarlo.",
    );
  if (terminal && (snap || terminal.ceilingBandId)) {
    const pose = terminal.ceilingBandId
      ? ceilingFrontPose(project, terminal, target)
      : snapTerminalPose(project, deviceId, target, snap!);
    return {
      ...project,
      airTerminals: project.airTerminals.map((t) =>
        t.id === deviceId
          ? {
              ...t,
              position: pose.position,
              roomId: pose.roomId,
              wallId: pose.wallId,
              rotation: pose.rotation,
              ceilingBandId: pose.ceilingBandId,
              ceilingEdge: pose.ceilingEdge,
              decisionOrigin: "manual",
              elevationM:
                "elevationM" in pose
                  ? pose.elevationM
                  : t.mounting === "ceiling"
                    ? ceilingHeightAt(
                        project,
                        project.rooms.find((r) => r.id === pose.roomId)!,
                        pose.position,
                      )
                    : t.elevationM,
            }
          : t,
      ),
    };
  }
  if (fanCoil?.mounting === "ceiling") {
    const room = project.rooms.find(
      (r) => r.floorId === fanCoil.floorId && pointInPolygon(target, r.polygon),
    );
    if (
      !room ||
      !footprintInsideRoom(
        room,
        target,
        fanCoil.widthMm / 1000,
        fanCoil.heightMm / 1000,
        fanCoil.rotation,
      )
    )
      throw new Error("Il ventilconvettore non rientra nella stanza.");
    const product = fanCoilProductAtVersion(
      fanCoil.productId,
      fanCoil.catalogVersion,
    );
    if (!product)
      throw new Error(
        "Modello ventilconvettore non verificabile nel catalogo originale.",
      );
    const dimensions = {
      ...fanCoil,
      family: product.family,
      features: product.features,
      ceilingInstallation: product.ceilingInstallation,
    };
    const range = fanCoilCeilingRange(
      project,
      room,
      dimensions,
      target,
      fanCoil.rotation,
    );
    if (!range)
      throw new Error(
        "Quota o vuoto tecnico insufficienti per il ventilconvettore.",
      );
    const before = project.rooms.find((item) => item.id === fanCoil.roomId);
    const previous =
      before &&
      fanCoilCeilingRange(
        project,
        before,
        dimensions,
        fanCoil.position,
        fanCoil.rotation,
      );
    const beforeZone = previous?.ranges.find(
      (zone) =>
        fanCoil.elevationM >= zone.minM - 1e-7 &&
        fanCoil.elevationM <= zone.maxM + 1e-7,
    );
    const afterZone = range.ranges.find(
      (zone) => zone.reference === beforeZone?.reference,
    );
    const beforeDatum = beforeZone
      ? beforeZone.reference === "below"
        ? beforeZone.maxM
        : beforeZone.minM
      : previous?.defaultM;
    const afterDatum = afterZone
      ? afterZone.reference === "below"
        ? afterZone.maxM
        : afterZone.minM
      : range.defaultM;
    const moved = {
      ...fanCoil,
      roomId: room.id,
      position: target,
      wallId: null,
      elevationM:
        afterDatum +
        (beforeDatum !== undefined ? fanCoil.elevationM - beforeDatum : 0),
    };
    if (!fanCoilPlacementValid(project, moved, product))
      throw new Error(
        "Quota o posizione non valide: verifica soffitto, vuoto tecnico e altri apparecchi.",
      );
    return {
      ...project,
      fanCoils: project.fanCoils!.map((u) => (u.id === deviceId ? moved : u)),
    };
  }
  if (terminal?.mounting === "ceiling") {
    const room = project.rooms.find(
      (r) =>
        r.floorId === terminal.floorId && pointInPolygon(target, r.polygon),
    );
    if (
      !room ||
      !footprintInsideRoom(
        room,
        target,
        terminal.widthMm / 1000,
        terminal.heightMm / 1000,
        terminal.rotation,
      )
    )
      throw new Error("Il terminale non rientra nel contorno della stanza.");
    if (
      terminal.systemId &&
      !project.hvacSystems.some(
        (s) =>
          s.id === terminal.systemId &&
          (s.indoorUnits.some((unit) => unit.floorId === room.floorId) ||
            (!s.indoorUnits.length && s.roomIds.includes(room.id))),
      )
    )
      throw new Error(
        "La stanza non è servita dal sistema di questo terminale.",
      );
    return {
      ...project,
      airTerminals: project.airTerminals.map((t) =>
        t.id === deviceId
          ? {
              ...t,
              roomId: room.id,
              position: target,
              elevationM: ceilingHeightAt(project, room, target),
              wallId: null,
            }
          : t,
      ),
    };
  }
  const candidates = project.rooms
    .filter((r) => r.floorId === item.floorId)
    .flatMap((room) =>
      project.walls
        .filter((w) => room.wallIds.includes(w.id))
        .map((wall) => ({ room, wall, span: roomWallSpan(room, wall) })),
    )
    .filter((c) => c.span && c.span.lengthM >= item.widthMm / 1000 + 0.2)
    .filter(
      (c) =>
        !recessedFanCoil ||
        c.wall.thickness +
          (c.wall.drywall?.roomId === c.room.id
            ? (c.wall.drywall.offsetM ?? 0)
            : 0) +
          1e-6 >=
          (item.depthMm ?? 0) / 1000 - 0.002,
    )
    .map((c) => ({
      ...c,
      nearest: projection(target, c.span!.start, c.span!.end),
    }))
    .sort((a, b) => distance(target, a.nearest) - distance(target, b.nearest));
  const chosen = candidates[0];
  if (!chosen)
    throw new Error(
      recessedFanCoil
        ? "Nessuna parete abbastanza spessa per l’incasso: serve spazio per tutto il corpo."
        : "Nessuna parete offre lo spazio necessario all'apparecchio.",
    );
  if (
    terminal?.systemId &&
    !project.hvacSystems.some(
      (system) =>
        system.id === terminal.systemId &&
        (system.indoorUnits.some(
          (unit) => unit.floorId === chosen.room.floorId,
        ) ||
          (!system.indoorUnits.length &&
            system.roomIds.includes(chosen.room.id))),
    )
  )
    throw new Error("La stanza non è servita dal sistema di questo terminale.");
  const span = chosen.span!,
    offset = Math.max(
      item.widthMm / 2000 + 0.1,
      Math.min(
        span.lengthM - item.widthMm / 2000 - 0.1,
        distance(chosen.nearest, span.start),
      ),
    );
  const moved = {
    roomId: chosen.room.id,
    wallId: chosen.wall.id,
    position: recessedFanCoil
      ? positionRecessedAlongRoomWall(
          chosen.room,
          chosen.wall,
          offset,
          (item.depthMm ?? 0) / 1000,
        )
      : positionAlongRoomWall(
          chosen.room,
          chosen.wall,
          offset,
          (item.depthMm ?? 0) / 1000,
        ),
    rotation: Math.atan2(span.end.y - span.start.y, span.end.x - span.start.x),
  };
  const radiator = project.radiators.find((unit) => unit.id === deviceId);
  if (
    radiator &&
    (!footprintInsideRoom(
      chosen.room,
      moved.position,
      radiator.widthMm / 1000,
      radiator.depthMm / 1000,
      moved.rotation,
    ) ||
      0.1 + radiator.heightMm / 1000 >
        minimumCeilingHeightM(
          project,
          chosen.room,
          footprintCorners(
            moved.position,
            radiator.widthMm / 1000,
            radiator.depthMm / 1000,
            moved.rotation,
          ),
        ) +
          1e-7)
  )
    throw new Error(
      "La posizione non contiene il radiatore sotto soffitto, fasce o falde.",
    );
  if (fanCoil && !fanCoilPlacementValid(project, { ...fanCoil, ...moved }))
    throw new Error(
      "Quota o posizione non valide: verifica soffitto, vuoto tecnico e altri apparecchi.",
    );
  const airUnit = project.hvacSystems
    .filter((system) => system.type === "split" || system.type === "vrv")
    .flatMap((system) => system.indoorUnits)
    .find((unit) => unit.id === deviceId);
  if (
    airUnit &&
    !indoorUnitFitsBelowCeiling(project, chosen.room, { ...airUnit, ...moved })
  )
    throw new Error(
      "Lo spazio sotto soffitto, fascia o falda non contiene l’apparecchio.",
    );
  return {
    ...project,
    radiators: project.radiators.map((d) =>
      d.id === deviceId ? { ...d, ...moved } : d,
    ),
    fanCoils: project.fanCoils?.map((d) =>
      d.id === deviceId ? { ...d, ...moved } : d,
    ),
    airTerminals: project.airTerminals.map((d) =>
      d.id === deviceId ? { ...d, ...moved } : d,
    ),
    hvacSystems: project.hvacSystems.map((s) => ({
      ...s,
      indoorUnits: s.indoorUnits.map((d) =>
        d.id === deviceId ? { ...d, ...moved } : d,
      ),
    })),
  };
}
