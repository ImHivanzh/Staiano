import { z } from "zod";

export const easyfattMappingSchema = z
  .object({
    code: z.string().trim().max(100),
    supplierCode: z.string().trim().max(100).optional(),
    supplier: z.string().trim().max(100).optional(),
    multiplier: z.number().finite().positive().max(10000),
    quantity: z.enum(["pieces", "material"]),
  })
  .strict()
  .refine((value) => !!value.code || !!value.supplierCode, "Inserire almeno un codice.");
export type EasyfattMapping = z.infer<typeof easyfattMappingSchema>;
export type EasyfattMappings = Record<string, EasyfattMapping>;
export function easyfattArticleKey(item: { mappingKey: string; sku?: string }) {
  return item.sku ? `ecoclima:${item.sku}` : item.mappingKey;
}
