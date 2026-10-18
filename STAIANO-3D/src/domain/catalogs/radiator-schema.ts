import { z } from "zod";
export const sourceMetadataSchema = z.object({
  manufacturer: z.string().min(1),
  sourceUrl: z.url(),
  sourceType: z.enum(["pdf", "html", "excel"]),
  documentRevision: z.string().nullable(),
  retrievedAt: z.iso.datetime({ offset: true }).nullable(),
  importedAt: z.iso.datetime({ offset: true }),
  sha256: z.string().length(64),
  page: z.number().int().positive().nullable(),
});
export const radiatorVariantSchema = z
  .object({
    id: z.string().min(1),
    manufacturer: z.string().min(1),
    family: z.string().min(1),
    model: z.string().min(1),
    code: z.string().nullable(),
    construction: z.enum(["sectional", "fixed"]).optional(),
    visualShape: z
      .enum(["tubular", "aluminium", "panel", "towel", "decorative"])
      .optional(),
    productPhoto: z
      .object({
        localPath: z.string().startsWith("/catalog-assets/"),
        sourceUrl: z.url(),
        sha256: z.string().length(64),
        caption: z.string().min(1),
      })
      .optional(),
    exponentMethod: z.enum(["manufacturer", "derived-q30-q50"]).optional(),
    geometryAccuracy: z.enum(["published", "schematic"]).optional(),
    geometryNote: z.string().optional(),
    columns: z.number().int().min(2).max(6).nullable(),
    heightMm: z.number().positive().max(4000),
    interaxisMm: z.number().positive(),
    depthMm: z.number().positive(),
    pitchMm: z.number().positive(),
    widthAdditionMm: z.number().nonnegative(),
    widthNote: z.string(),
    commercialElementCounts: z
      .array(z.number().int().positive().max(500))
      .min(1),
    elementOutputW: z.number().positive().max(3000),
    referenceDeltaTK: z.number().positive(),
    elementOutput30W: z.number().positive().nullable(),
    exponentN: z.number().positive().max(3).nullable(),
    coefficientKm: z.number().positive().nullable(),
    waterContentL: z.number().nonnegative().nullable(),
    weightKg: z.number().nonnegative().nullable(),
    nominalFlowKgh: z.number().nonnegative().nullable(),
    maxPressureBar: z.number().positive().nullable(),
    maxTemperatureC: z.number().positive().nullable(),
    connections: z.string().nullable(),
    sourceMetadata: sourceMetadataSchema,
  })
  .refine(
    (v) => v.construction === "fixed" || v.interaxisMm < v.heightMm,
    "Interasse maggiore dell'altezza",
  )
  .refine(
    (v) =>
      v.construction !== "fixed" ||
      (v.commercialElementCounts.length === 1 &&
        v.commercialElementCounts[0] === 1 &&
        v.widthAdditionMm === 0),
    "Prodotto fisso con larghezza o conteggio variabile",
  );
export const radiatorCatalogSchema = z
  .object({
    version: z.string().min(1),
    manufacturer: z.string().min(1),
    products: z.array(radiatorVariantSchema).min(1),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.products.map((p) => p.id)).size !== c.products.length)
      ctx.addIssue({ code: "custom", message: "Doppioni nel catalogo" });
    if (c.products.some((p) => p.manufacturer !== c.manufacturer))
      ctx.addIssue({ code: "custom", message: "Produttore incoerente" });
  });
export type RadiatorVariant = z.infer<typeof radiatorVariantSchema>;
export type RadiatorCatalog = z.infer<typeof radiatorCatalogSchema>;
