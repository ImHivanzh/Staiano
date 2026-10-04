import type { HvacProduct } from "@/domain/catalogs/hvac-schema";
import { maximumAirflowOption } from "@/domain/catalogs/hvac-airflow";
export function selectDuctedMachine(
  requiredW: number,
  manufacturer: string,
  products: HvacProduct[],
) {
  if (!Number.isFinite(requiredW) || requiredW <= 0)
    throw new Error("Fabbisogno totale positivo necessario.");
  return products
    .filter(
      (p) =>
        p.kind === "ducted" &&
        p.manufacturer === manufacturer &&
        p.availability !== "archived" &&
        p.pairingVerified &&
        p.coolingCapacityW >= requiredW &&
        p.heatingCapacityW !== null &&
        p.heatingCapacityW >= requiredW &&
        maximumAirflowOption(p) !== null,
    )
    .sort(
      (a, b) =>
        a.coolingCapacityW - b.coolingCapacityW ||
        maximumAirflowOption(a)!.airflowM3h -
          maximumAirflowOption(b)!.airflowM3h,
    );
}
export function distributeAirflow(
  rooms: {
    id: string;
    designLoadW: number;
    supplyPoints: number;
    returnPoints: number;
  }[],
  machineAirflowM3h: number,
) {
  if (
    !Number.isFinite(machineAirflowM3h) ||
    machineAirflowM3h <= 0 ||
    rooms.length === 0 ||
    rooms.some(
      (r) =>
        !Number.isFinite(r.designLoadW) ||
        r.designLoadW <= 0 ||
        !Number.isInteger(r.supplyPoints) ||
        r.supplyPoints < 1 ||
        !Number.isInteger(r.returnPoints) ||
        r.returnPoints < 1,
    ) ||
    new Set(rooms.map((r) => r.id)).size !== rooms.length
  )
    throw new Error("Portata, fabbisogni e numero punti devono essere validi.");
  const totalLoadW = rooms.reduce((sum, r) => sum + r.designLoadW, 0);
  let assignedAirflowM3h = 0;
  return rooms.map((r, index) => {
    const share = r.designLoadW / totalLoadW,
      airflowM3h =
        index === rooms.length - 1
          ? machineAirflowM3h - assignedAirflowM3h
          : machineAirflowM3h * share;
    assignedAirflowM3h += airflowM3h;
    return {
      roomId: r.id,
      totalLoadW,
      roomLoadW: r.designLoadW,
      share,
      airflowM3h,
      supplyAirflowPerPointM3h: airflowM3h / r.supplyPoints,
      returnAirflowPerPointM3h: airflowM3h / r.returnPoints,
    };
  });
}
