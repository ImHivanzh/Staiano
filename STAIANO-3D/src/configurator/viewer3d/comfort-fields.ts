import type { Project } from "@/schemas/project";
import { splitCenterElevationM } from "@/domain/air-conditioning/elevation";
import { needsTerminalReconfiguration } from "@/domain/air-terminals/legacy";

export type ComfortMode = "cool" | "heat";
export type ComfortField = {
  deviceId: string;
  kind: "supply" | "return" | "convection";
  start: [number, number, number];
  control: [number, number, number];
  end: [number, number, number];
};

/** Directional illustration from the actual placements. No CFD, throw or speed claim. */
export function comfortFields(
  project: Project,
  floorId: string,
  mode: ComfortMode,
  roomId?: string,
): ComfortField[] {
  const fields: ComfortField[] = [];
  const visible = (item: { floorId: string; roomId: string }) =>
    item.floorId === floorId && (!roomId || item.roomId === roomId);
  const air = (
    item: {
      id: string;
      position: { x: number; y: number };
      rotation: number;
      widthMm: number;
      roomId: string;
    },
    elevation: number,
    ceiling: boolean,
    returned = false,
  ) => {
    const room = project.rooms.find((r) => r.id === item.roomId);
    if (!room || room.geometryStatus !== "closed") return;
    const width = Math.min(item.widthMm / 1000, 1.7);
    const forward = { x: -Math.sin(item.rotation), y: Math.cos(item.rotation) };
    const rising = mode === "heat" && !returned;
    const startHeight = returned
      ? elevation
      : Math.min(elevation, room.heightM - 0.08);
    const endHeight = rising
      ? Math.min(room.heightM - 0.02, startHeight + 0.95)
      : Math.max(0.04, startHeight - (ceiling ? 1.1 : 0.55));
    for (let i = 0; i < 3; i++) {
      const across = (i - 1) * width * 0.28;
      const x = item.position.x + across * Math.cos(item.rotation);
      const z = item.position.y + across * Math.sin(item.rotation);
      const distance =
        ceiling && !rising
          ? 0.3
          : Math.min(1.8, Math.sqrt(room.netAreaM2) * 0.36);
      const spread = (i - 1) * width * 0.18;
      const start: ComfortField["start"] = [x, startHeight, z];
      const end: ComfortField["end"] = [
        x + forward.x * distance + spread * Math.cos(item.rotation),
        endHeight,
        z + forward.y * distance + spread * Math.sin(item.rotation),
      ];
      const control: ComfortField["control"] = [
        x + forward.x * distance * 0.6,
        startHeight + (endHeight - startHeight) * 0.25,
        z + forward.y * distance * 0.6,
      ];
      fields.push({
        deviceId: item.id,
        kind: returned ? "return" : "supply",
        start: returned ? end : start,
        control,
        end: returned ? start : end,
      });
    }
  };
  for (const terminal of project.airTerminals.filter(visible)) {
    if (!needsTerminalReconfiguration(terminal) && terminal.elevationM !== null)
      air(
        terminal,
        terminal.elevationM - 0.01,
        terminal.mounting === "ceiling",
        terminal.use === "return",
      );
  }
  for (const system of project.hvacSystems.filter((s) => s.type === "split"))
    for (const unit of system.indoorUnits.filter(visible)) {
      const room = project.rooms.find((r) => r.id === unit.roomId);
      if (room)
        air(
          unit,
          splitCenterElevationM(room, unit) - unit.heightMm / 3000,
          false,
        );
    }
  for (const unit of (project.fanCoils ?? []).filter(visible))
    air(unit, unit.elevationM, unit.mounting === "ceiling");
  if (mode === "heat")
    for (const radiator of project.radiators.filter(visible)) {
      const room = project.rooms.find((r) => r.id === radiator.roomId);
      if (!room || room.geometryStatus !== "closed") continue;
      for (let i = 0; i < 3; i++) {
        const across = (((i - 1) * radiator.widthMm) / 1000) * 0.25;
        const x = radiator.position.x + across * Math.cos(radiator.rotation);
        const z = radiator.position.y + across * Math.sin(radiator.rotation);
        const elevation = 0.1 + radiator.heightMm / 1000;
        fields.push({
          deviceId: radiator.id,
          kind: "convection",
          start: [x, elevation, z],
          control: [
            x - Math.sin(radiator.rotation) * 0.15,
            Math.min(room.heightM - 0.05, elevation + 0.45),
            z + Math.cos(radiator.rotation) * 0.15,
          ],
          end: [
            x - Math.sin(radiator.rotation) * 0.3,
            Math.min(room.heightM - 0.03, elevation + 0.95),
            z + Math.cos(radiator.rotation) * 0.3,
          ],
        });
      }
    }
  return fields;
}
