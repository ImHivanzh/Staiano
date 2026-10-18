import type { RadiatorVariant } from "@/domain/catalogs/radiator-schema";
import {
  sizeRadiators,
  type RadiatorConstraints,
  type RadiatorSolution,
} from "./size";

export type RadiatorAutoConstraints = Omit<
  RadiatorConstraints,
  "manufacturer" | "family" | "numberOfRadiators"
> & {
  manufacturer?: string;
  family?: string;
  numberOfRadiators?: number;
};
export type RadiatorAutoProgress = {
  phase: string;
  states: number;
  bestPowerW: number | null;
};

/** Omitted brand/family does not silently constrain sizing to the first catalogue. */
export function sizeRadiatorsAcrossFamilies(
  requiredW: number,
  catalog: RadiatorVariant[],
  deltaTK: number,
  constraints: RadiatorAutoConstraints,
  onProgress?: (progress: RadiatorAutoProgress) => void,
): RadiatorSolution[] {
  return sizeRadiators(
    requiredW,
    catalog,
    deltaTK,
    {
      ...constraints,
      manufacturer: constraints.manufacturer ?? "",
      family: constraints.family ?? "",
      numberOfRadiators: constraints.numberOfRadiators ?? 1,
    },
    onProgress,
  ).slice(0, 20);
}
