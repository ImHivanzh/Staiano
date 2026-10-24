import { z } from "zod";
import snapshot from "../../../catalog-data/generated/radiator-sections.json" with { type: "json" };
import type { RadiatorVariant } from "./radiator-schema";
import type { Project } from "@/schemas/project";
const sectionSchema = z.object({
  columns: z.number().int().min(2).max(6),
  sourceModelId: z.string().min(1),
  sourceUrl: z.url(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceHeightMm: z.number().positive(),
  connectionOffsetMm: z.number().positive(),
  measuredInteraxisMm: z.number().positive(),
  fixedEndMm: z.number().positive().max(100),
  tubeRadialDeviationMm: z.number().nonnegative().max(0.5),
  measuredDimensionsMm: z.tuple([
    z.number().positive(),
    z.number().positive(),
    z.number().positive(),
  ]),
  localUrl: z.string().regex(/^\/models3d\/ardesia-section-[2-6]\.glb$/),
  glbSha256: z.string().regex(/^[a-f0-9]{64}$/),
  glbBytes: z.number().int().positive(),
  vertices: z.number().int().positive(),
  triangles: z.number().int().positive(),
});
export const radiatorSections = z
  .object({ version: z.literal(1), sections: z.array(sectionSchema).length(5) })
  .parse(snapshot).sections;
export type RadiatorSection = (typeof radiatorSections)[number];
export function radiatorSectionFor(
  item: Pick<
    Project["radiators"][number],
    "manufacturer" | "elements" | "widthMm" | "heightMm" | "depthMm"
  >,
  variant: RadiatorVariant | null,
) {
  if (
    !variant ||
    variant.manufacturer !== "Cordivari" ||
    variant.family !== `Ardesia ${variant.columns} colonne` ||
    item.manufacturer !== variant.manufacturer ||
    variant.pitchMm !== 46 ||
    item.heightMm !== variant.heightMm ||
    item.depthMm !== variant.depthMm ||
    Math.abs(
      item.widthMm -
        (item.elements * variant.pitchMm + variant.widthAdditionMm),
    ) > 1e-6
  )
    return null;
  return (
    radiatorSections.find(
      (section) =>
        section.columns === variant.columns &&
        Math.abs(
          variant.interaxisMm - (item.heightMm - section.connectionOffsetMm),
        ) < 1e-6 &&
        Math.abs(section.measuredDimensionsMm[2] - item.depthMm) <= 1 &&
        item.heightMm > section.fixedEndMm * 2,
    ) ?? null
  );
}
/** Only axial tube length changes. End profiles and every X/Z coordinate stay untouched. */
export function sectionVertexY(
  y: number,
  heightMm: number,
  section: RadiatorSection,
) {
  const half = section.measuredDimensionsMm[1] / 2000,
    fixed = section.fixedEndMm / 1000,
    delta = (heightMm - section.sourceHeightMm) / 1000;
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(heightMm) ||
    heightMm <= section.fixedEndMm * 2
  )
    throw new Error("Altezza incompatibile con le testate originali.");
  return Math.abs(y) >= half - fixed
    ? y + (Math.sign(y) * delta) / 2
    : y * (1 + delta / (2 * (half - fixed)));
}
