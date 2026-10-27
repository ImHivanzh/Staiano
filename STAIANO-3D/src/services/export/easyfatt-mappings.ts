import { z } from "zod";
import {
  easyfattMappingSchema,
  type EasyfattMappings,
} from "@/domain/catalogs/easyfatt-mapping";

export async function loadEasyfattMappings(): Promise<EasyfattMappings> {
  const response = await fetch("/api/easyfatt-mappings", { cache: "no-store" });
  if (!response.ok)
    throw new Error("Impossibile caricare i codici Easyfatt condivisi.");
  const data = await response.json();
  return z.record(z.string(), easyfattMappingSchema).parse(data.mappings);
}
