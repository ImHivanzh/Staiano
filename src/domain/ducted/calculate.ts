import type { HvacProduct } from "@/domain/catalogs/hvac-schema";
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
        p.defaultAirflowIndex !== null &&
        p.airflowOptions[p.defaultAirflowIndex],
    )
    .sort(
      (a, b) =>
        a.coolingCapacityW - b.coolingCapacityW ||
        a.airflowOptions[a.defaultAirflowIndex!].airflowM3h -
          b.airflowOptions[b.defaultAirflowIndex!].airflowM3h,
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
  return rooms.map((r) => {
    const share = r.designLoadW / totalLoadW,
      airflowM3h = machineAirflowM3h * share;
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
