import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
export const hvacProductSchema = z
  .object({
    id: z.string().min(1),
    manufacturer: z.enum(["Daikin", "Mitsubishi Electric", "Gree"]),
    family: z.string().min(1),
    kind: z.enum(["split", "ducted"]),
    indoorModel: z.string().min(1),
    outdoorModel: z.string().nullable(),
    coolingCapacityW: z.number().positive(),
    heatingCapacityW: z.number().positive().nullable(),
    airflowOptions: z.array(
      z.object({ label: z.string(), airflowM3h: z.number().positive() }),
    ),
    defaultAirflowIndex: z.number().int().nonnegative().nullable(),
    staticPressurePa: z.number().nonnegative().nullable(),
    staticPressureOptionsPa: z.array(z.number().nonnegative()),
    widthMm: z.number().positive().nullable(),
    heightMm: z.number().positive().nullable(),
    depthMm: z.number().positive().nullable(),
    pairingVerified: z.boolean(),
    availability: z.enum(["published", "archived", "unknown"]),
    technicalNotes: z.string(),
    sourceMetadata: sourceMetadataSchema,
  })
  .superRefine((p, ctx) => {
    if (
      p.defaultAirflowIndex !== null &&
      !p.airflowOptions[p.defaultAirflowIndex]
    )
      ctx.addIssue({
        code: "custom",
        message: "Portata di calcolo non presente nel catalogo",
      });
    if (p.pairingVerified && !p.outdoorModel)
      ctx.addIssue({
        code: "custom",
        message: "Abbinamento dichiarato senza unità esterna",
      });
  });
export const hvacCatalogSchema = z
  .object({
    version: z.string().min(1),
    products: z.array(hvacProductSchema).min(1),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.products.map((p) => p.id)).size !== c.products.length)
      ctx.addIssue({ code: "custom", message: "Prodotti HVAC duplicati" });
  });
export type HvacProduct = z.infer<typeof hvacProductSchema>;
