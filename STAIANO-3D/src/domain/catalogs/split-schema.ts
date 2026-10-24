import { z } from "zod";
import { sourceMetadataSchema } from "./radiator-schema";
const manufacturer = z.enum(["Daikin", "Mitsubishi Electric", "Gree"]);
const capacity = z.number().finite().positive();
export const splitOutdoorSchema = z.object({
  manufacturer,
  model: z.string().min(1),
  widthMm: capacity,
  heightMm: capacity,
  depthMm: capacity,
  dimensionNote: z.string().min(1),
  sourceMetadata: sourceMetadataSchema,
});
export const splitIndoorSchema = z.object({
  id: z.string().min(1),
  manufacturer,
  family: z.string().min(1),
  model: z.string().min(1),
  sizeClass: z.string().min(1),
  nominalCoolingW: capacity.nullable(),
  nominalHeatingW: capacity.nullable(),
  widthMm: capacity,
  heightMm: capacity,
  depthMm: capacity,
  region: z.string().nullable().default(null),
  notes: z.string().default(""),
  sourceMetadata: sourceMetadataSchema,
});
export const splitCombinationSchema = z
  .object({
    id: z.string().min(1),
    manufacturer,
    mode: z.enum(["mono", "multi"]),
    outdoorModel: z.string().min(1),
    indoorProductIds: z.array(z.string().min(1)).min(1).max(6),
    coolingCapacityW: capacity,
    heatingCapacityW: capacity.nullable(),
    indoorCoolingW: z.array(capacity.nullable()).min(1).max(6),
    indoorHeatingW: z.array(capacity.nullable()).min(1).max(6),
    minIndoorUnits: z.number().int().min(1).max(6),
    maxIndoorUnits: z.number().int().min(1).max(6),
    maxConnectedCapacityW: capacity.nullable(),
    approved: z.boolean(),
    notes: z.string(),
    sourceMetadata: sourceMetadataSchema,
    region: z.string().nullable().default(null),
    secondarySourceMetadata: z.array(sourceMetadataSchema).default([]),
  })
  .superRefine((c, ctx) => {
    const n = c.indoorProductIds.length;
    if (
      c.indoorCoolingW.length !== n ||
      c.indoorHeatingW.length !== n ||
      n < c.minIndoorUnits ||
      n > c.maxIndoorUnits ||
      (c.mode === "mono" && n !== 1) ||
      (c.mode === "multi" && n < 2)
    )
      ctx.addIssue({
        code: "custom",
        message: "Combinazione split incoerente",
      });
    // Some manufacturer tables round per-room capacities to0.1kW (50W per cell).
    for (const [values, total] of [
      [c.indoorCoolingW, c.coolingCapacityW],
      [c.indoorHeatingW, c.heatingCapacityW],
    ] as const)
      if (
        total !== null &&
        values.every((v) => v !== null) &&
        Math.abs(values.reduce<number>((s, v) => s + (v ?? 0), 0) - total) >
          n * 50 + 1e-6
      )
        ctx.addIssue({
          code: "custom",
          message: "Ripartizione split discordante dalla capacità totale",
        });
  });
export const splitCatalogSchema = z
  .object({
    version: z.string().min(1),
    indoorUnits: z.array(splitIndoorSchema).min(1),
    outdoorUnits: z.array(splitOutdoorSchema).default([]),
    combinations: z.array(splitCombinationSchema).min(1),
  })
  .superRefine((c, ctx) => {
    const units = new Map(c.indoorUnits.map((u) => [u.id, u]));
    const outdoors = new Set(
      c.outdoorUnits.map((u) => `${u.manufacturer}:${u.model}`),
    );
    if (
      units.size !== c.indoorUnits.length ||
      new Set(c.combinations.map((v) => v.id)).size !== c.combinations.length ||
      outdoors.size !== c.outdoorUnits.length
    )
      ctx.addIssue({ code: "custom", message: "ID split duplicati" });
    for (const combo of c.combinations)
      if (
        c.outdoorUnits.length &&
        !outdoors.has(`${combo.manufacturer}:${combo.outdoorModel}`)
      )
        ctx.addIssue({
          code: "custom",
          message: "Misure dell'unità esterna mancanti nella revisione",
        });
    for (const combo of c.combinations)
      if (
        combo.indoorProductIds.some(
          (id) => units.get(id)?.manufacturer !== combo.manufacturer,
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Unità interna incompatibile con marca combinazione",
        });
  });
export type SplitCatalog = z.infer<typeof splitCatalogSchema>;
export type SplitIndoor = z.infer<typeof splitIndoorSchema>;
export type SplitOutdoor = z.infer<typeof splitOutdoorSchema>;
export type SplitCombination = z.infer<typeof splitCombinationSchema>;
