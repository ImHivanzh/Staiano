import type { Project } from "@/schemas/project";
import { hvacProductAtVersion } from "@/domain/catalogs/hvac";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";

type DuctedSystem = Project["hvacSystems"][number];

/** Manual values are operator declarations, never verified manufacturer data. */
export function resolveDuctedMachine(system: DuctedSystem) {
  if (system.type !== "ducted" || system.compatibilityStatus === "invalid")
    return null;
  // Il ventilconvettore canalizzabile presta la propria portata alla
  // distribuzione aeraulica: non è una macchina a espansione diretta.
  if (system.fanCoilId) {
    const manual = system.genericMachine;
    return manual
      ? {
          manufacturer: manual.manufacturer,
          model: manual.model,
          maxAirflowM3h: manual.maxAirflowM3h,
          dataOrigin: "fanCoil" as const,
          product: null,
        }
      : null;
  }
  if (system.genericMachine) {
    const manual = system.genericMachine;
    return {
      manufacturer: manual.manufacturer,
      model: manual.model,
      maxAirflowM3h: manual.maxAirflowM3h,
      dataOrigin: "manual" as const,
      product: null,
    };
  }
  if (
    system.dataOrigin === "manual" ||
    system.compatibilityStatus !== "verified"
  )
    return null;
  const product = hvacProductAtVersion(system.productId, system.catalogVersion);
  const maximum = maximumAirflowOption(product);
  return product?.kind === "ducted" && product.pairingVerified && maximum
    ? {
        manufacturer: product.manufacturer,
        model: product.indoorModel,
        maxAirflowM3h: maximum.airflowM3h,
        dataOrigin: "catalog" as const,
        product,
      }
    : null;
}

export function ductedMaximumAirflow(system: DuctedSystem) {
  return resolveDuctedMachine(system)?.maxAirflowM3h ?? null;
}
