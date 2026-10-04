import type { Project } from "@/schemas/project";
import type { AirTerminalFamily } from "@/domain/catalogs/air-terminal-schema";
import { resolveDuctedMachine } from "@/domain/ducted/machine";
import { distributeAirflow } from "@/domain/ducted/calculate";
import { sizeAirTerminal, type AirTerminalSolution } from "./size";

/** One chosen model and operating condition across the independently served rooms. */
export function terminalDistribution(
  project: Project,
  systemId: string,
  family: AirTerminalFamily,
  choice: AirTerminalSolution,
  use: "supply" | "return",
) {
  const system = project.hvacSystems.find(
    (s) => s.id === systemId && s.type === "ducted",
  );
  const machine = system && resolveDuctedMachine(system);
  if (!system || !machine) return null;
  const rooms = project.rooms.filter((room) =>
    system.roomIds.includes(room.id),
  );
  if (!rooms.length || rooms.some((room) => room.geometryStatus !== "closed"))
    return null;
  const allocations = distributeAirflow(rooms, machine.maxAirflowM3h);
  const model = {
    ...family,
    variants: [{ ...choice.variant, operatingPoints: [choice.operatingPoint] }],
  };
  const rows = rooms.map((room) => {
    const allocation = allocations.find((a) => a.roomId === room.id)!;
    const points = use === "supply" ? room.supplyPoints : room.returnPoints;
    const solution =
      sizeAirTerminal(allocation.airflowM3h, points, model, use)[0] ?? null;
    const physicalLength =
      solution?.commercialLengthM ??
      (choice.variant.lengthMm ? choice.variant.lengthMm / 1000 : null);
    return {
      roomId: room.id,
      roomName: room.name,
      areaM2: room.netAreaM2,
      heightM: room.heightM,
      share: allocation.share,
      airflowM3h: allocation.airflowM3h,
      points,
      solution,
      theoreticalLengthM:
        solution?.theoreticalLengthM === null || !solution
          ? null
          : solution.theoreticalLengthM * points,
      commercialLengthM:
        physicalLength === null || !solution
          ? null
          : physicalLength * solution.quantityPerPoint * points,
      units: solution ? solution.quantityPerPoint * points : 0,
    };
  });
  return {
    machine,
    systemId,
    rows,
    theoreticalLengthM:
      family.isLinearPerMeter && choice.operatingPoint.airflowPerMeterM3h
        ? machine.maxAirflowM3h / choice.operatingPoint.airflowPerMeterM3h
        : null,
    commercialLengthM: rows.every((row) => row.commercialLengthM !== null)
      ? rows.reduce((sum, row) => sum + row.commercialLengthM!, 0)
      : null,
    totalUnits: rows.reduce((sum, row) => sum + row.units, 0),
    complete: rows.every((row) => !!row.solution),
    sameHeights: rooms.every((room) => room.heightM === rooms[0].heightM),
  };
}
