import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";

const finite = z.number().finite();
const power = z.object({ minW: finite.positive(), maxW: finite.positive() }).refine((value) => value.maxW >= value.minW);

export const stoveTechnicalProductSchema = z.object({
  id: z.string().min(1),
  dimensionsMm: z.object({ widthMm: finite.positive(), heightMm: finite.positive(), depthMm: finite.positive() }).nullable(),
  nominalPowerW: power.nullable(),
  waterPowerW: power.nullable(),
  partLoadPowerW: finite.positive().nullable(),
  weightKg: finite.positive().nullable(),
  flueDiameterMm: finite.positive().nullable(),
  articleCode: z.string().min(1).optional(),
  imageAssetSku: z.string().regex(/^\d+$/).nullable().optional(),
  sourceMetadata: sourceMetadataSchema,
  supportingSources: z.array(z.object({ sourceMetadata: sourceMetadataSchema })).default([]),
});

export const stoveTechnicalCatalogSchema = z.object({
  version: z.literal(1),
  products: z.array(stoveTechnicalProductSchema),
});

export type StoveTechnicalProduct = z.infer<typeof stoveTechnicalProductSchema>;
