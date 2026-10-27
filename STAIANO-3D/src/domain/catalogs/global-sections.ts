import type { RadiatorVariant } from "./radiator-schema";
import type { Project } from "@/schemas/project";

/** Reference heights and fixed end zones of scripts/blender/global-radiators.py. */
const GLOBAL_SECTIONS = {
  VIP: { url: "/models/hvac/global-vip-section.glb", referenceMm: 690 },
  OSCAR: { url: "/models/hvac/global-oscar-section.glb", referenceMm: 1246 },
} as const;
const BOTTOM_FIXED_M = 0.055;
const TOP_FIXED_M = 0.085;
const PITCH_MM = 80;
const DEPTH_MM = 95;

export type GlobalSection = {
  url: string;
  referenceMm: number;
  /** Centre of the side connections above the bottom edge, metres. */
  connectionAboveBottomM: number;
};

/** Only catalogue-exact VIP/OSCAR radiators get the cast element; others keep the sketch. */
export function globalSectionFor(
  item: Pick<
    Project["radiators"][number],
    "manufacturer" | "elements" | "widthMm" | "heightMm" | "depthMm"
  >,
  variant: RadiatorVariant | null,
): GlobalSection | null {
  if (
    !variant ||
    variant.manufacturer !== "Global" ||
    item.manufacturer !== "Global" ||
    !(variant.family in GLOBAL_SECTIONS) ||
    variant.pitchMm !== PITCH_MM ||
    variant.depthMm !== DEPTH_MM ||
    item.depthMm !== DEPTH_MM ||
    item.heightMm !== variant.heightMm ||
    item.widthMm !== item.elements * PITCH_MM ||
    item.heightMm <= (BOTTOM_FIXED_M + TOP_FIXED_M) * 1000
  )
    return null;
  const base = GLOBAL_SECTIONS[variant.family as keyof typeof GLOBAL_SECTIONS];
  return {
    ...base,
    connectionAboveBottomM: (variant.heightMm - variant.interaxisMm) / 2000,
  };
}

/** Stretches only the plain middle of the front panel; both cast ends keep their shape. */
export function globalSectionVertexY(
  y: number,
  heightMm: number,
  section: Pick<GlobalSection, "referenceMm">,
) {
  const half = section.referenceMm / 2000,
    delta = (heightMm - section.referenceMm) / 1000,
    low = -half + BOTTOM_FIXED_M,
    high = half - TOP_FIXED_M,
    t = Math.min(1, Math.max(0, (y - low) / (high - low)));
  return y + delta * (t - 0.5);
}
