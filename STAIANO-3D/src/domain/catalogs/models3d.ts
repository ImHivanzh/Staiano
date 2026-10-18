import { z } from "zod";
import snapshot from "../../../catalog-data/generated/models3d.json";

const dimensions = z.tuple([
  z.number().positive().max(10000),
  z.number().positive().max(10000),
  z.number().positive().max(10000),
]);
export const model3dSchema = z
  .object({
    id: z.string().min(1),
    manufacturer: z.string().min(1),
    family: z.string().min(1),
    productId: z.string().min(1),
    columns: z.number().int().min(2).max(6),
    elements: z.number().int().positive(),
    revision: z.string().min(1),
    sourceUrl: z.url(),
    sourcePage: z.url(),
    sourceFormat: z.literal("obj"),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().positive(),
    retrievedAt: z.iso.datetime({ offset: true }),
    localUrl: z.string().regex(/^\/models3d\/[a-z0-9-]+\.glb$/),
    glbSha256: z.string().regex(/^[a-f0-9]{64}$/),
    glbBytes: z.number().int().positive(),
    vertices: z.number().int().positive(),
    triangles: z.number().int().positive(),
    nominalDimensionsMm: dimensions,
    measuredDimensionsMm: dimensions,
    dimensionStatus: z.enum(["verified", "review"]),
    rights: z.string().min(1),
    conversion: z.string().min(1),
  })
  .superRefine((model, ctx) => {
    if (
      model.dimensionStatus === "verified" &&
      model.nominalDimensionsMm.some(
        (value, i) => Math.abs(value - model.measuredDimensionsMm[i]) > 1,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Geometry differs from catalog dimensions",
      });
  });

export const model3dCatalog = z
  .object({
    version: z.literal(1),
    models: z.array(model3dSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    if (new Set(catalog.models.map((m) => m.id)).size !== catalog.models.length)
      ctx.addIssue({ code: "custom", message: "Duplicate 3D asset" });
  })
  .parse(snapshot);

export type Model3D = z.infer<typeof model3dSchema>;

/** Geometry under review is never used as a verified placement footprint. */
export function verifiedRadiatorModel(productId: string, elements: number) {
  return (
    model3dCatalog.models.find(
      (model) =>
        model.productId === productId &&
        model.elements === elements &&
        model.dimensionStatus === "verified",
    ) ?? null
  );
}
