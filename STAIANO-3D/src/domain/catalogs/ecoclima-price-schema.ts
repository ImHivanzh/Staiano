import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";

/** Recorded order choices. Absence never means a guessed finish or model. */
export const terminalCommercialOptionsSchema = z.object({
  profileCode: z.string().min(1).max(100).optional(),
  colorCode: z.string().min(1).max(50).optional(),
  mountingDuctDiameterMm: z.number().int().positive().max(4000).optional(),
  fixingBridges: z.boolean().default(true),
  continuityKit: z.boolean().default(true),
  linearRunId: z.string().min(1).max(120).optional(),
  linearRunOrder: z.number().int().nonnegative().max(2000).optional(),
});
export type TerminalCommercialOptions = z.infer<
  typeof terminalCommercialOptionsSchema
>;

const mm = z.number().int().positive().nullable();
export const commercialDimensionsSchema = z.object({
  lengthMm: mm,
  widthMm: mm,
  heightMm: mm,
  diameterMm: mm,
  slotCount: mm,
  slotWidthMm: mm,
});
export const officialCommercialSourceSchema = sourceMetadataSchema.refine(
  (source) =>
    new URL(source.sourceUrl).hostname === "www.ecoclima.com" ||
    new URL(source.sourceUrl).hostname === "ecoclima.com",
  "Commercial prices require the original Ecoclima publisher",
);
export const ecoclimaPriceSchema = z.object({
  id: z.string().min(1),
  familyCode: z.string().min(1),
  kind: z.enum([
    "terminal",
    "insulated-plenum",
    "fixing-bridge",
    "continuity-kit",
    "fixing-kit",
    "accessory",
  ]),
  modelCode: z.string().min(1),
  catalogSizeCode: z.string().nullable().optional(),
  technicalVariantIds: z.array(z.string()).default([]),
  originalDimensionsMm: z.record(z.string(), z.number().finite()).optional(),
  label: z.string().min(1),
  dimensions: commercialDimensionsSchema,
  colorCode: z.string().nullable(),
  connectionPosition: z.enum(["lateral", "upper"]).nullable(),
  unitPriceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("EUR"),
  sourceMetadata: officialCommercialSourceSchema,
  sourceTable: z.number().int().nonnegative(),
  sourceRow: z.number().int().nonnegative(),
  sourceColumn: z.number().int().nonnegative(),
  originalPrice: z.string(),
});
export const terminalAccessorySpecificationSchema = z.object({
  familyCode: z.string(),
  dimensions: commercialDimensionsSchema,
  fixingBridgeQuantity: z.number().int().positive().nullable(),
  fixingBridgeSourceMetadata: officialCommercialSourceSchema
    .nullable()
    .optional(),
  fixingKitQuantity: z.number().int().positive().nullable().optional(),
  fixingKitSourceMetadata: officialCommercialSourceSchema.nullable().optional(),
  continuitySupported: z.boolean(),
  plenum: z
    .object({
      modelCode: z.string(),
      lengthMm: mm,
      widthMm: mm,
      heightMm: mm,
      publishedDimensionsMm: z.record(z.string(), z.number().finite()),
      connectionPosition: z.enum(["lateral", "upper"]),
      portCount: z.number().int().positive(),
      portDiameterMm: z.number().positive(),
      material: z.string(),
      insulation: z.string(),
      sourceMetadata: officialCommercialSourceSchema.optional(),
    })
    .nullable(),
  sourceMetadata: officialCommercialSourceSchema,
});
export const ecoclimaPriceCatalogSchema = z
  .object({
    version: z.string().min(1),
    revision: z.string().nullable(),
    prices: z.array(ecoclimaPriceSchema),
    accessorySpecifications: z.array(terminalAccessorySpecificationSchema),
    coverage: z.array(
      z.object({
        familyCode: z.string(),
        sourceUrl: z.url(),
        status: z.enum([
          "published",
          "no-published-price",
          "source-unavailable",
          "normalization-review",
        ]),
        note: z.string(),
      }),
    ),
  })
  .superRefine((catalog, context) => {
    if (
      new Set(catalog.prices.map((price) => price.id)).size !==
      catalog.prices.length
    )
      context.addIssue({ code: "custom", message: "Duplicate commercial SKU" });
  });
export type EcoclimaPrice = z.infer<typeof ecoclimaPriceSchema>;
export type EcoclimaPriceCatalog = z.infer<typeof ecoclimaPriceCatalogSchema>;
export type TerminalAccessorySpecification = z.infer<
  typeof terminalAccessorySpecificationSchema
>;
