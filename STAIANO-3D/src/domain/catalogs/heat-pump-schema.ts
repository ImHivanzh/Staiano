import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
import { productPhotoSchema } from "./fan-coil-schema";
const positive = z.number().finite().positive();
export const heatPumpProductSchema = z.object({
  id: z.string().min(1),
  manufacturer: z.enum(["Chaffoteaux", "Daikin", "Gree"]),
  family: z.string().min(1),
  model: z.string().min(1),
  widthMm: positive,
  heightMm: positive,
  depthMm: positive,
  dimensionNote: z.string(),
  features: z.array(z.string()),
  productPhoto: productPhotoSchema,
  sourceMetadata: sourceMetadataSchema,
  operatingPoints: z
    .array(
      z
        .object({
          label: z.string(),
          heatingW: positive,
          coolingW: positive,
          maxHeatingW: positive.optional(),
          maxCoolingW: positive.optional(),
          heatingConditions: z.string(),
          coolingConditions: z.string(),
          heatingWaterSupplyC: z.number().finite(),
          coolingWaterSupplyC: z.number().finite(),
          heatingOutdoorC: z.number().finite(),
          coolingOutdoorC: z.number().finite(),
          cop: positive.nullable(),
          eer: positive.nullable(),
        })
        .refine(
          (point) =>
            (point.maxHeatingW === undefined ||
              point.maxHeatingW >= point.heatingW) &&
            (point.maxCoolingW === undefined ||
              point.maxCoolingW >= point.coolingW),
          "La potenza massima non può essere inferiore alla nominale",
        ),
    )
    .min(1),
});
export const heatPumpCatalogSchema = z
  .object({
    version: z.string(),
    products: z.array(heatPumpProductSchema).min(1),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.products.map((p) => p.id)).size !== c.products.length)
      ctx.addIssue({ code: "custom", message: "Pompe di calore duplicate" });
  });
export type HeatPumpProduct = z.infer<typeof heatPumpProductSchema>;
export type HeatPumpCatalog = z.infer<typeof heatPumpCatalogSchema>;
