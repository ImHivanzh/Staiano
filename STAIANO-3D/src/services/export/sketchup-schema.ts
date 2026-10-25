import { z } from "zod";
import { floorSchema } from "@/schemas/project";

export const MAX_SKETCHUP_BYTES = 64 * 1024 * 1024;
export const sketchupModelSchema = z
  .object({
    name: z.string().trim().min(1).max(260),
    meshes: z
      .array(
        z.object({
          name: z.string().max(200),
          groupId: z.uuid().optional(),
          vertices: z
            .array(z.number().finite().min(-1e6).max(1e6))
            .min(9)
            .max(900000)
            .refine((v) => v.length % 9 === 0),
          color: z.tuple([
            z.number().int().min(0).max(255),
            z.number().int().min(0).max(255),
            z.number().int().min(0).max(255),
            z.number().int().min(0).max(255),
          ]),
        }),
      )
      .min(1)
      .max(10000),
    background: floorSchema.shape.background,
  })
  .refine(
    (model) =>
      model.meshes.reduce((sum, m) => sum + m.vertices.length, 0) <= 3000000,
    "Modello troppo complesso per SKP: esporta un piano più piccolo.",
  );
export type SketchupModel = z.infer<typeof sketchupModelSchema>;
