import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
import { productPhotoSchema } from "./fan-coil-schema";
const positive = z.number().finite().positive();
const watts = z.number().int().positive();
const ratio = z.number().finite().min(1).max(500);

export const vrvOutdoorSchema = z
  .object({
    id: z.string().min(1),
    manufacturer: z.literal("Daikin"),
    family: z.string().min(1),
    model: z.string().min(1),
    coolingW: watts,
    heatingW: watts,
    maxHeatingW: watts,
    minConnectionRatio: ratio,
    maxConnectionRatio: ratio,
    widthMm: positive,
    heightMm: positive,
    depthMm: positive,
    dimensionNote: z.string(),
    features: z.array(z.string()),
    productPhoto: productPhotoSchema,
    sourceMetadata: sourceMetadataSchema,
  })
  .superRefine((unit, ctx) => {
    if (
      unit.maxHeatingW < unit.heatingW ||
      unit.maxConnectionRatio < unit.minConnectionRatio
    )
      ctx.addIssue({
        code: "custom",
        message: "Capacità o rapporto di connessione VRV incoerenti",
      });
  });

export const vrvIndoorSchema = z.object({
  id: z.string().min(1),
  manufacturer: z.literal("Daikin"),
  family: z.string().min(1),
  model: z.string().min(1),
  sizeClass: z.string().min(1),
  nominalCoolingW: watts,
  nominalHeatingW: watts,
  widthMm: positive,
  heightMm: positive,
  depthMm: positive,
  features: z.array(z.string()),
  productPhoto: productPhotoSchema,
  sourceMetadata: sourceMetadataSchema,
});

export const vrvCatalogSchema = z
  .object({
    version: z.string().min(1),
    outdoorUnits: z.array(vrvOutdoorSchema).min(1),
    indoorUnits: z.array(vrvIndoorSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    if (
      new Set(catalog.outdoorUnits.map((unit) => unit.id)).size !==
        catalog.outdoorUnits.length ||
      new Set(catalog.indoorUnits.map((unit) => unit.id)).size !==
        catalog.indoorUnits.length
    )
      ctx.addIssue({ code: "custom", message: "ID VRV duplicati" });
    const outdoorModels = new Set(
      catalog.outdoorUnits.map((unit) => unit.model),
    );
    if (outdoorModels.size !== catalog.outdoorUnits.length)
      ctx.addIssue({ code: "custom", message: "Modelli esterni VRV duplicati" });
  });

export type VrvOutdoor = z.infer<typeof vrvOutdoorSchema>;
export type VrvIndoor = z.infer<typeof vrvIndoorSchema>;
export type VrvCatalog = z.infer<typeof vrvCatalogSchema>;
