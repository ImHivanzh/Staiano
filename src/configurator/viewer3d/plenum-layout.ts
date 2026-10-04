import type { HvacProduct } from "@/domain/catalogs/hvac-schema";
import type { PlenumBranch } from "@/domain/ducted/plenum";
import {
  machinePlenumGeometry,
  type MachinePlenumDesignSettings,
  type MachinePlenumGeometry,
} from "@/domain/ducted/machine-plenum";
export type PlenumPort = {
  branch: PlenumBranch;
  number: number;
  diameterM: number;
  collarLengthM: number;
  position: [number, number, number];
};
export type PlenumLayout = {
  ports: PlenumPort[];
  /** Full custom body bounds, including taper; metres. */
  body: [number, number, number];
  inlet: [number, number];
  transitionDepthM: number;
  boxDepthM: number;
  rows: number;
  geometry: MachinePlenumGeometry;
};
export function layoutFromMachineGeometry(
  geometry: MachinePlenumGeometry,
): PlenumLayout {
  return {
    geometry,
    ports: geometry.ports.map((port) => ({
      branch: port.branch,
      number: port.number,
      diameterM: port.diameterMm / 1000,
      collarLengthM: port.collarLengthMm / 1000,
      position: port.centerMm.map((v) => v / 1000) as [number, number, number],
    })),
    body: [
      (geometry.bodyWidthMm ?? 0) / 1000,
      (geometry.bodyHeightMm ?? 0) / 1000,
      ((geometry.boxDepthMm ?? 0) + (geometry.transitionDepthMm ?? 0)) / 1000,
    ],
    inlet: [
      (geometry.inlet?.connectionWidthMm ?? 0) / 1000,
      (geometry.inlet?.connectionHeightMm ?? 0) / 1000,
    ],
    transitionDepthM: (geometry.transitionDepthMm ?? 0) / 1000,
    boxDepthM: (geometry.boxDepthMm ?? 0) / 1000,
    rows: geometry.rows,
  };
}
/** 3D and 2D use the same manufacturer adapter and dimensioned custom geometry. */
export function plenumLayout(
  branches: readonly PlenumBranch[],
  machine: HvacProduct | null,
  override?: Partial<MachinePlenumDesignSettings>,
): PlenumLayout {
  return layoutFromMachineGeometry(
    machinePlenumGeometry(branches, machine, override),
  );
}
