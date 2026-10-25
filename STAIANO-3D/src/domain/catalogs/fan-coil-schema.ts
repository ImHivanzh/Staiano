import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
const positive = z.number().finite().positive();
export const productPhotoSchema = z.object({
  localPath: z.string().startsWith("/catalog-assets/"),
  sourceUrl: z.url(),
  sha256: z.string().length(64),
  caption: z.string(),
});
export const fanCoilProductSchema = z.object({
  id: z.string().min(1),
  manufacturer: z.string().min(1),
  family: z.string().min(1),
  model: z.string().min(1),
  pipes: z.enum(["2", "4"]),
  widthMm: positive,
  heightMm: positive,
  depthMm: positive,
  recessDepthMm: positive.optional(),
  mountings: z.array(z.enum(["wall", "ceiling"])).min(1),
  dimensionNote: z.string(),
  features: z.array(z.string()),
  productPhoto: productPhotoSchema.nullable(),
  operatingPoints: z
    .array(
      z.object({
        label: z.string(),
        coolingW: positive,
        heatingW: positive,
        airflowM3h: positive.nullable(),
        noiseDbA: z.number().nonnegative().nullable(),
        coolingConditions: z.string(),
        heatingConditions: z.string(),
        noiseConditions: z.string(),
      }),
    )
    .min(1),
  sourceMetadata: sourceMetadataSchema,
  ceilingInstallation: z
    .object({
      minFaceHeightM: positive,
      note: z.string().min(1),
      sourceMetadata: sourceMetadataSchema,
    })
    .nullable()
    .optional(),
});
export const controlProductSchema = z.object({
  id: z.string().min(1),
  manufacturer: z.string(),
  series: z.string(),
  model: z.string(),
  widthMm: positive,
  heightMm: positive,
  depthMm: positive,
  connection: z.enum(["wired", "wifi-wired", "bluetooth"]),
  features: z.array(z.string()),
  compatibleFamilies: z.array(z.string()),
  requiredBoards: z.array(z.string()),
  productPhoto: productPhotoSchema.nullable(),
  sourceMetadata: sourceMetadataSchema,
});
export const fanCoilCatalogSchema = z
  .object({
    version: z.string(),
    products: z.array(fanCoilProductSchema),
    controls: z.array(controlProductSchema),
  })
  .superRefine((c, ctx) => {
    const ids = [...c.products, ...c.controls].map((p) => p.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Prodotti ventilconvettori duplicati",
      });
  });
export type FanCoilProduct = z.infer<typeof fanCoilProductSchema>;
export type FanCoilControl = z.infer<typeof controlProductSchema>;
export type FanCoilCatalog = z.infer<typeof fanCoilCatalogSchema>;
export type FanCoilOperatingPoint = FanCoilProduct["operatingPoints"][number];
