import raw from "../../../catalog-data/generated/ecoclima.json";
import { airTerminalCatalogSchema } from "./air-terminal-schema";
export const airTerminalCatalog = airTerminalCatalogSchema.parse(raw);
