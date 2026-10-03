import type { Project } from "@/schemas/project";
import type { Check } from "@/domain/validation";
import { splitCatalogAtVersion } from "@/domain/catalogs/splits";
import { footprintInsideRoom } from "@/domain/geometry/footprint";
import { roomWallSpan } from "@/domain/geometry/placement";
export function validateSplitSystem(
  project: Project,
  system: Project["hvacSystems"][number],
): Check[] {
  if (system.type !== "split") return [];
  const catalog = splitCatalogAtVersion(system.catalogVersion),
    combination = catalog?.combinations.find((c) => c.id === system.productId),
    checks: Check[] = [],
    emit = (
      code: string,
      status: Check["status"],
      message: string,
      entityId = system.id,
    ) => checks.push({ code, status, message, entityId });
  if (!combination) {
    emit(
      "split-catalog",
      "invalid",
      "Compatibilità split non verificabile: snapshot o combinazione ufficiale non disponibile.",
    );
    return checks;
  }
  emit(
    "split-compatibility",
    combination.approved && system.compatibilityStatus === "verified"
      ? "valid"
      : "invalid",
    `${combination.outdoorModel}: combinazione ${combination.approved ? "approvata dal produttore" : "non verificabile"}.`,
  );
  if (combination.region === "UK")
    emit(
      "split-availability",
      "warning",
      "SKU Mitsubishi del catalogo UK: verificare disponibilità italiana; nessuna sostituzione automatica con VGKP o VGK2.",
    );
  const rooms = project.rooms.filter((r) => system.roomIds.includes(r.id)),
    load = rooms.reduce((s, r) => s + r.designLoadW, 0);
  emit(
    "split-capacity",
    combination.coolingCapacityW >= load &&
      (combination.heatingCapacityW ?? 0) >= load
      ? "valid"
      : "invalid",
    "Split: verifica capacità nominali totali in raffrescamento e riscaldamento.",
  );
  emit(
    "split-rooms",
    system.indoorUnits.length === system.roomIds.length &&
      new Set(system.indoorUnits.map((u) => u.roomId)).size ===
        system.indoorUnits.length
      ? "valid"
      : "invalid",
    "Split: una unità interna per stanza configurata.",
  );
  emit(
    "split-count",
    system.indoorUnits.length === combination.indoorProductIds.length
      ? "valid"
      : "invalid",
    "Split: numero unità conforme alla combinazione approvata.",
  );
  const connected = system.indoorUnits.map(
    (u) =>
      catalog!.indoorUnits.find((m) => m.id === u.productId)?.nominalCoolingW ??
      null,
  );
  if (combination.maxConnectedCapacityW !== null)
    emit(
      "split-connected-capacity",
      connected.every((v) => v !== null) &&
        connected.reduce<number>((s, v) => s + (v ?? 0), 0) <=
          combination.maxConnectedCapacityW
        ? "valid"
        : "invalid",
      "Split: capacità collegata entro il limite dichiarato dal produttore.",
    );
  emit(
    "split-record",
    system.manufacturer === combination.manufacturer &&
      Math.abs(system.capacityW - combination.coolingCapacityW) < 1e-6
      ? "valid"
      : "invalid",
    "Split: dati salvati coerenti con lo snapshot produttore.",
  );
  const unused = combination.indoorProductIds.map((productId, index) => ({
    productId,
    index,
    used: false,
  }));
  for (const unit of system.indoorUnits) {
    const room = rooms.find((r) => r.id === unit.roomId),
      model = catalog!.indoorUnits.find((u) => u.id === unit.productId),
      slot = unused.find((v) => !v.used && v.productId === unit.productId);
    if (!room || !model || !slot) {
      emit(
        "split-indoor",
        "invalid",
        "Unità interna non presente nella combinazione configurata.",
        unit.id,
      );
      continue;
    }
    slot.used = true;
    const cooling = combination.indoorCoolingW[slot.index],
      heating = combination.indoorHeatingW[slot.index];
    emit(
      "split-room-capacity",
      cooling !== null &&
        heating !== null &&
        cooling >= room.designLoadW &&
        heating >= room.designLoadW
        ? "valid"
        : "invalid",
      `${room.name}: capacità simultanee pubblicate ${cooling ?? "non disponibile"}/${heating ?? "non disponibile"}W; richiesta${room.designLoadW.toFixed(1)}W.`,
      unit.id,
    );
    const wall = project.walls.find((w) => w.id === unit.wallId),
      span = wall && roomWallSpan(room, wall);
    emit(
      "split-dimensions",
      unit.catalogVersion === system.catalogVersion &&
        unit.widthMm === model.widthMm &&
        unit.heightMm === model.heightMm &&
        unit.depthMm === model.depthMm
        ? "valid"
        : "invalid",
      `${model.model}: dimensioni coerenti con il catalogo.`,
      unit.id,
    );
    emit(
      "split-placement",
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
      `${model.model}: ingombro e parete disponibili.`,
      unit.id,
    );
  }
  return checks;
}
