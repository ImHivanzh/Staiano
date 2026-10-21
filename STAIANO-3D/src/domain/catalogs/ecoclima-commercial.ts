import { z } from "zod";
import raw from "../../../catalog-data/generated/ecoclima-commercial.json" with { type: "json" };
import { sourceMetadataSchema } from "./radiator-schema";

/** Published original price tables, deliberately isolated from technical sizing. */
export const commercialCatalogSchema = z
  .object({
    version: z.string().min(1),
    families: z
      .array(
        z.object({
          id: z.string().min(1),
          familyCode: z.string().min(1),
          publisherLabel: z.string().min(1),
          currency: z.literal("EUR"),
          tables: z
            .array(z.array(z.array(z.string().max(2000)).max(100)).max(1000))
            .min(1)
            .max(50),
          sourceMetadata: sourceMetadataSchema,
        }),
      )
      .min(1),
  })
  .superRefine((catalog, ctx) => {
    if (
      new Set(catalog.families.map((f) => f.id)).size !==
      catalog.families.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate commercial source page",
      });
    for (const source of catalog.families)
      if (
        !source.tables.every((rows) =>
          rows.some((row) => row.some((cell) => cell.includes("€"))),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Table lacks original currency heading",
        });
  });
export const ecoclimaCommercialCatalog = commercialCatalogSchema.parse(raw);
