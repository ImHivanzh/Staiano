import { z } from "zod";

export const radiatorFinishRoleSchema = z.enum([
  "body",
  "valve",
  "lockshield",
  "pipeCover",
]);
export type RadiatorFinishRole = z.infer<typeof radiatorFinishRoleSchema>;
const roleFamiliesSchema = z.object({
  body: z.array(z.string()).optional(),
  valve: z.array(z.string()).optional(),
  lockshield: z.array(z.string()).optional(),
  pipeCover: z.array(z.string()).optional(),
});
const defaultFinishIdsSchema = z.object({
  body: z.string().optional(),
  valve: z.string().optional(),
  lockshield: z.string().optional(),
  pipeCover: z.string().optional(),
});
export const radiatorFinishSchema = z.object({
  id: z.string().min(1),
  manufacturer: z.string().min(1),
  code: z.string().min(1),
  label: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-f]{6}$/i),
  ralCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  kind: z.enum(["paint", "metal", "mineral"]),
  supportedRoles: z.array(radiatorFinishRoleSchema).min(1),
  availability: roleFamiliesSchema,
  sourceId: z.string().min(1),
  availabilitySourceId: z.string().min(1).optional(),
  availabilitySourceUrl: z.url().optional(),
  sourceUrl: z.url(),
  sourcePage: z.number().int().positive().nullable(),
  swatchSourceUrl: z.url().optional(),
  swatchSha256: z.string().length(64).optional(),
  previewMethod: z.enum([
    "manufacturer-pdf-swatch",
    "manufacturer-image-swatch",
    "representative-display",
  ]),
  previewNote: z.string().min(1),
  availabilityNote: z.string(),
});
export const radiatorFinishCatalogSchema = z
  .object({
    version: z.string().min(1),
    previewDisclaimer: z.string().min(1),
    families: z
      .array(
        z.object({
          id: z.string().min(1),
          manufacturer: z.string().min(1),
          aliases: z.array(z.string().min(1)).min(1),
          defaultFinishIds: defaultFinishIdsSchema,
          note: z.string(),
        }),
      )
      .min(1),
    finishes: z.array(radiatorFinishSchema).min(1),
    sources: z
      .array(
        z.object({
          id: z.string().min(1),
          sourceUrl: z.url(),
          sourceType: z.enum(["pdf", "html", "web-extract"]),
          localPath: z.string().startsWith("catalog-data/sources/"),
          retrievedAt: z.iso.datetime({ offset: true }),
          sha256: z.string().length(64),
          documentRevision: z.string().nullable(),
          pageCount: z.number().int().positive().optional(),
        }),
      )
      .min(1),
  })
  .superRefine((catalog, ctx) => {
    const finishIds = new Set(catalog.finishes.map((finish) => finish.id));
    const familyIds = new Set(catalog.families.map((family) => family.id));
    const sourceIds = new Set(catalog.sources.map((source) => source.id));
    if (
      finishIds.size !== catalog.finishes.length ||
      familyIds.size !== catalog.families.length ||
      sourceIds.size !== catalog.sources.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "ID duplicati nel catalogo finiture",
      });
    }
    for (const finish of catalog.finishes) {
      if (
        finish.availabilitySourceId &&
        !sourceIds.has(finish.availabilitySourceId)
      )
        ctx.addIssue({
          code: "custom",
          message: `Fonte disponibilità mancante: ${finish.id}`,
        });
      if (!sourceIds.has(finish.sourceId))
        ctx.addIssue({
          code: "custom",
          message: `Fonte mancante: ${finish.id}`,
        });
      for (const role of radiatorFinishRoleSchema.options) {
        const supported = finish.supportedRoles.includes(role);
        const families = finish.availability[role];
        if (supported !== Boolean(families?.length))
          ctx.addIssue({
            code: "custom",
            message: `Ruolo incoerente: ${finish.id}/${role}`,
          });
        for (const familyId of families ?? []) {
          const family = catalog.families.find(
            (entry) => entry.id === familyId,
          );
          if (
            !familyIds.has(familyId) ||
            family?.manufacturer !== finish.manufacturer
          )
            ctx.addIssue({
              code: "custom",
              message: `Famiglia incoerente: ${finish.id}/${familyId}`,
            });
        }
      }
    }
    for (const family of catalog.families) {
      for (const role of radiatorFinishRoleSchema.options) {
        const id = family.defaultFinishIds[role];
        if (!id) continue;
        const finish = catalog.finishes.find((entry) => entry.id === id);
        if (!finish?.availability[role]?.includes(family.id))
          ctx.addIssue({
            code: "custom",
            message: `Default non supportato: ${family.id}/${role}`,
          });
      }
    }
  });
export type RadiatorFinish = z.infer<typeof radiatorFinishSchema>;
export type RadiatorFinishCatalog = z.infer<typeof radiatorFinishCatalogSchema>;
