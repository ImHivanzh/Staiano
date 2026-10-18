import type { Project } from "@/schemas/project";
import { heatPumpProductAtVersion } from "@/domain/catalogs/heat-pumps";
import { fanCoilProductAtVersion } from "@/domain/catalogs/fan-coils";
import { hydronicOutdoorValid, type HydronicSystem } from "./placement";
import { hydronicTargets, hydronicRoomIds } from "../ducted/plan-connections";

export function validateHydronicSystem(
  project: Project,
  system: HydronicSystem,
) {
  const model = heatPumpProductAtVersion(
      system.productId,
      system.catalogVersion,
    ),
    point = model?.operatingPoints[system.operatingPointIndex];
  const rooms = project.rooms.filter((r) => system.roomIds.includes(r.id));
  const designLoadW = rooms.reduce((n, r) => n + r.designLoadW, 0);
  const warnings: string[] = [];
  let fanCoilHeatingW = 0,
    fanCoilCoolingW = 0,
    unknownCoils = 0;
  if (!point)
    warnings.push(
      "Modello o punto originale della pompa non verificabile: capacità esclusa dal confronto.",
    );
  if (!hydronicOutdoorValid(project, system.outdoorUnit))
    warnings.push(
      "Posizione esterna non valida: verificare muri, ambienti e ostacoli.",
    );
  const connectedTargets = hydronicTargets(project, system.outdoorUnit.id);
  const ductedUnits = project.hvacSystems.filter(
    (s) =>
      s.type === "ducted" &&
      s.indoorUnits.some((u) => system.terminalIds?.includes(u.id)),
  );
  if (!system.fanCoilIds.length && !connectedTargets.length)
    warnings.push(
      "Nessun ventilconvettore collegato: aggiungere e associare i terminali agli ambienti.",
    );
  if (ductedUnits.length)
    warnings.push(
      "Unità canalizzate ad acqua con dati manuali: verificare potenze e portate idrauliche alle temperature della PdC; escluse dal totale dei ventilconvettori con temperature verificate.",
    );
  const sameTemperature = (conditions: string, water: number) => {
    const match = conditions.match(/acqua\s+(\d+(?:[.,]\d+)?)\s*\/\s*\d+/i);
    return !!match && Number(match[1].replace(",", ".")) === water;
  };
  for (const id of system.fanCoilIds) {
    const unit = project.fanCoils?.find((u) => u.id === id),
      product =
        unit && fanCoilProductAtVersion(unit.productId, unit.catalogVersion),
      op = unit && product?.operatingPoints[unit.operatingPointIndex];
    if (
      !unit ||
      !op ||
      !point ||
      !sameTemperature(op.heatingConditions, point.heatingWaterSupplyC) ||
      !sameTemperature(op.coolingConditions, point.coolingWaterSupplyC)
    ) {
      unknownCoils++;
      if (op && point)
        warnings.push(
          `${product!.model}: condizioni acqua terminale diverse o non documentate rispetto alla pompa; capacità esclusa dal totale compatibile.`,
        );
      continue;
    }
    fanCoilHeatingW += op.heatingW;
    fanCoilCoolingW += op.coolingW;
  }
  const heatingW = point?.heatingW ?? 0,
    coolingW = point?.coolingW ?? 0;
  if (point && heatingW < designLoadW)
    warnings.push(
      "Potenza della pompa in riscaldamento inferiore al fabbisogno degli ambienti serviti.",
    );
  if (point && coolingW < designLoadW)
    warnings.push(
      "Potenza della pompa in raffrescamento inferiore alla stima preliminare degli ambienti serviti.",
    );
  if (
    system.fanCoilIds.length &&
    (fanCoilHeatingW < designLoadW || fanCoilCoolingW < designLoadW)
  )
    warnings.push(
      "I ventilconvettori con temperature verificabili non coprono separatamente il fabbisogno in caldo e freddo.",
    );
  if (unknownCoils)
    warnings.push(
      `${unknownCoils} terminali esclusi dal confronto compatibile: verificare i dati del costruttore alle temperature selezionate.`,
    );
  for (const room of rooms) {
    if (
      !system.fanCoilIds.some((id) =>
        project.fanCoils?.some((u) => u.id === id && u.roomId === room.id),
      ) &&
      !hydronicRoomIds(project, system.outdoorUnit.id).includes(room.id)
    )
      warnings.push(
        `${room.name}: ambiente servito senza ventilconvettori associati.`,
      );
  }
  warnings.push(
    "Verifica preliminare su potenze nominali: carico a 35 W/m³, temperatura esterna di progetto, sbrinamento, portate, accumulo, perdite e distanze di posa richiedono progetto tecnico. Non certifica il dimensionamento idraulico.",
  );
  return {
    designLoadW,
    heatingW,
    coolingW,
    fanCoilHeatingW,
    fanCoilCoolingW,
    warnings,
    capacityCovered:
      !!point && heatingW >= designLoadW && coolingW >= designLoadW,
  };
}
