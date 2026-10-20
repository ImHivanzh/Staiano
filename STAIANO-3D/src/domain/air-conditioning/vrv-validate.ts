import type { Project } from "@/schemas/project";
import type { Check } from "@/domain/validation";
import { vrvCatalogAtVersion } from "@/domain/catalogs/vrv";
import { footprintInsideRoom } from "@/domain/geometry/footprint";
import { roomWallSpan } from "@/domain/geometry/placement";

export function vrvConnectedW(
  project: Project,
  system: Project["hvacSystems"][number],
  catalog: NonNullable<ReturnType<typeof vrvCatalogAtVersion>>,
) {
  return system.indoorUnits.reduce((sum, placed) => {
    const indoor = catalog.indoorUnits.find(
      (unit) => unit.id === placed.productId,
    );
    return sum + (indoor?.nominalCoolingW ?? 0);
  }, 0);
}

export function vrvConnectionRatio(
  project: Project,
  system: Project["hvacSystems"][number],
  catalog: NonNullable<ReturnType<typeof vrvCatalogAtVersion>>,
) {
  const outdoor = catalog.outdoorUnits.find(
    (unit) => unit.id === system.productId,
  );
  if (!outdoor) return null;
  return (vrvConnectedW(project, system, catalog) / outdoor.coolingW) * 100;
}

export function validateVrvSystem(
  project: Project,
  system: Project["hvacSystems"][number],
): Check[] {
  if (system.type !== "vrv") return [];
  const catalog = vrvCatalogAtVersion(system.catalogVersion),
    outdoor = catalog?.outdoorUnits.find(
      (unit) => unit.id === system.productId,
    ),
    checks: Check[] = [],
    emit = (
      code: string,
      status: Check["status"],
      message: string,
      entityId = system.id,
    ) => checks.push({ code, status, message, entityId });
  if (!catalog || !outdoor) {
    emit(
      "vrv-catalog",
      "invalid",
      "Compatibilità VRV non verificabile: snapshot o unità esterna ufficiale non disponibile.",
    );
    return checks;
  }
  emit(
    "vrv-compatibility",
    system.compatibilityStatus === "verified" ? "valid" : "invalid",
    `${outdoor.model}: abbinamento VRV/VRF verificato sul catalogo ufficiale.`,
  );
  const rooms = project.rooms.filter((room) =>
      system.roomIds.includes(room.id),
    ),
    load = rooms.reduce((sum, room) => sum + room.designLoadW, 0),
    connected = vrvConnectedW(project, system, catalog),
    ratio = (connected / outdoor.coolingW) * 100;
  emit(
    "vrv-capacity",
    outdoor.coolingW >= load && outdoor.heatingW >= load
      ? "valid"
      : "invalid",
    `VRV: capacità esterna ${outdoor.coolingW / 1000}/${outdoor.heatingW / 1000} kW contro ${load / 1000} kW richiesti.`,
  );
  emit(
    "vrv-ratio",
    ratio >= outdoor.minConnectionRatio &&
      ratio <= outdoor.maxConnectionRatio
      ? "valid"
      : "invalid",
    `VRV: rapporto di connessione ${ratio.toFixed(0)}% entro ${outdoor.minConnectionRatio}–${outdoor.maxConnectionRatio}%.`,
  );
  emit(
    "vrv-rooms",
    system.indoorUnits.length === system.roomIds.length &&
      new Set(system.indoorUnits.map((unit) => unit.roomId)).size ===
        system.indoorUnits.length
      ? "valid"
      : "invalid",
    "VRV: una unità interna per stanza configurata.",
  );
  const used = new Map<string, number>();
  for (const unit of system.indoorUnits) {
    used.set(unit.productId, (used.get(unit.productId) ?? 0) + 1);
    const room = rooms.find((item) => item.id === unit.roomId),
      indoor = catalog.indoorUnits.find(
        (model) => model.id === unit.productId,
      );
    if (!room || !indoor) {
      emit(
        "vrv-indoor",
        "invalid",
        "Unità interna VRV non presente nel catalogo ufficiale.",
        unit.id,
      );
      continue;
    }
    emit(
      "vrv-room-capacity",
      indoor.nominalCoolingW >= room.designLoadW &&
        indoor.nominalHeatingW >= room.designLoadW
        ? "valid"
        : "invalid",
      `${room.name}: capacità nominale pubblicata ${indoor.nominalCoolingW}/${indoor.nominalHeatingW} W; richiesta ${room.designLoadW.toFixed(1)} W.`,
      unit.id,
    );
    emit(
      "vrv-dimensions",
      unit.catalogVersion === system.catalogVersion &&
        unit.widthMm === indoor.widthMm &&
        unit.heightMm === indoor.heightMm &&
        unit.depthMm === indoor.depthMm
        ? "valid"
        : "invalid",
      `${indoor.model}: dimensioni coerenti con il catalogo.`,
      unit.id,
    );
    const wall = project.walls.find((item) => item.id === unit.wallId),
      span = wall && roomWallSpan(room, wall);
    emit(
      "vrv-placement",
      span &&
        span.lengthM >= unit.widthMm / 1000 + 0.2 &&
        unit.heightMm / 1000 + 0.1 <= room.heightM &&
        footprintInsideRoom(
          room,
          unit.position,
          unit.widthMm / 1000,
          unit.depthMm / 1000,
          unit.rotation,
        )
        ? "valid"
        : "invalid",
      `${indoor.model}: ingombro e parete disponibili.`,
      unit.id,
    );
  }
  emit(
    "vrv-record",
    system.manufacturer === "Daikin" &&
      system.capacityW !== null &&
      Math.abs(system.capacityW - outdoor.coolingW) < 1e-6
      ? "valid"
      : "invalid",
    "VRV: dati salvati coerenti con lo snapshot produttore.",
  );
  return checks;
}
