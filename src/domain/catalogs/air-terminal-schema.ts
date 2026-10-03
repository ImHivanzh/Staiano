import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
export const operatingPointSchema = z.object({
  airflowM3h: z.number().positive(),
  airflowPerMeterM3h: z.number().positive().nullable(),
  velocityMs: z.number().nonnegative().nullable(),
  pressureDropPa: z.number().nonnegative().nullable(),
  throwM: z.number().nonnegative().nullable(),
  noiseDbA: z.number().nonnegative().nullable(),
  noiseUpperBoundDbA: z.number().nonnegative().nullable(),
  noiseLabel: z.string(),
  referenceLengthM: z.number().positive().nullable(),
  quality: z.enum(["valid", "review"]).default("valid"),
  qualityNote: z.string().nullable().default(null),
  openingMm: z.number().finite().nullable().optional(),
});
export const airTerminalVariantSchema = z.object({
  id: z.string().min(1),
  widthMm: z.number().positive().nullable(),
  heightMm: z.number().positive().nullable(),
  depthMm: z.number().positive().nullable(),
  lengthMm: z.number().positive().nullable(),
  slotWidthMm: z.number().positive().nullable(),
  slotCount: z.number().int().positive().nullable(),
  commercialLengthsMm: z.array(z.number().positive()),
  effectiveAreaM2: z.number().positive().nullable(),
  operatingPoints: z.array(operatingPointSchema),
  nominalDiameterMm: z.number().positive().optional(),
  originalDimensionsMm: z.record(z.string(), z.number().finite()).optional(),
  publishedAirflowRangeM3h: z
    .tuple([z.number().nonnegative(), z.number().positive()])
    .refine(([low, high]) => low <= high)
    .optional(),
  faceWidthMm: z.number().positive().nullable().optional(),
  faceHeightMm: z.number().positive().nullable().optional(),
  bodyDepthMm: z.number().positive().nullable().optional(),
});
export const airTerminalFamilySchema = z.object({
  manufacturer: z.string().min(1),
  familyCode: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  type: z.enum(["linear", "grille", "diffuser", "valve"]),
  mountingType: z.string(),
  use: z.array(z.enum(["supply", "return", "transfer"])).min(1),
  isLinearPerMeter: z.boolean(),
  image: z.string().nullable(),
  operatingConditions: z.string(),
  variants: z.array(airTerminalVariantSchema).min(1),
  sourceMetadata: sourceMetadataSchema,
  mountings: z.array(z.enum(["wall", "ceiling"])).optional(),
  shape: z.enum(["rectangle", "circle"]).optional(),
  geometryNote: z.string().optional(),
});
export const airTerminalCatalogSchema = z
  .object({
    version: z.string().min(1),
    families: z.array(airTerminalFamilySchema).min(1),
  })
  .superRefine((c, ctx) => {
    const ids = c.families.flatMap((f) => f.variants.map((v) => v.id));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Varianti terminali duplicate" });
    for (const f of c.families)
      for (const v of f.variants)
        if (
          f.isLinearPerMeter &&
          (!v.commercialLengthsMm.length ||
            v.operatingPoints.some((p) => p.airflowPerMeterM3h === null))
        )
          ctx.addIssue({
            code: "custom",
            message: "Dati lineari per metro mancanti",
          });
  });
export type OperatingPoint = z.infer<typeof operatingPointSchema>;
export type AirTerminalVariant = z.infer<typeof airTerminalVariantSchema>;
export type AirTerminalFamily = z.infer<typeof airTerminalFamilySchema>;
