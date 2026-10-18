import type { Point, Project } from "@/schemas/project";
import { placeEquipmentDraft } from "./equipment-draft";
import { distance, projection, pointInPolygon } from "./primitives";
import { footprintInsideRoom } from "./footprint";
import { positionAlongRoomWall, roomWallSpan } from "./placement";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";
import { snapTerminalPose } from "./terminal-snap";
import type { SnapOptions } from "./primitives";
import { moveSystemObject } from "@/domain/ducted/placement";
import {
  moveHydronicOutdoorUnit,
  placeHeatPumpDraft,
} from "@/domain/hydronic/apply";
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
  if (item.locked)
    throw new Error("Sbloccare l’apparecchio prima di spostarlo.");
  if (terminal && needsTerminalReconfiguration(terminal))
    throw new Error(
      "Terminale legacy: riconfigurare il montaggio nella stanza prima di spostarlo.",
    );
  if (terminal && snap) {
    const pose = snapTerminalPose(project, deviceId, target, snap);
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
              decisionOrigin: "manual",
              elevationM:
                t.mounting === "ceiling"
                  ? project.rooms.find((r) => r.id === pose.roomId)!.heightM
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
    return {
      ...project,
      fanCoils: project.fanCoils!.map((u) =>
        u.id === deviceId
          ? {
              ...u,
              roomId: room.id,
              position: target,
              wallId: null,
              elevationM: room.heightM,
            }
          : u,
      ),
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
              elevationM: room.heightM,
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
    .map((c) => ({
      ...c,
      nearest: projection(target, c.span!.start, c.span!.end),
    }))
    .sort((a, b) => distance(target, a.nearest) - distance(target, b.nearest));
  const chosen = candidates[0];
  if (!chosen)
    throw new Error(
      "Nessuna parete offre lo spazio necessario all'apparecchio.",
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
    position: positionAlongRoomWall(
      chosen.room,
      chosen.wall,
      offset,
      (item.depthMm ?? 0) / 1000,
    ),
    rotation: Math.atan2(span.end.y - span.start.y, span.end.x - span.start.x),
  };
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
