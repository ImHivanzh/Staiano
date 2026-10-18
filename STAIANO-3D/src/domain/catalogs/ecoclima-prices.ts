import raw from "../../../catalog-data/generated/ecoclima-prices.json";
import { ecoclimaPriceCatalogSchema } from "./ecoclima-price-schema";
export const ecoclimaPriceCatalog = ecoclimaPriceCatalogSchema.parse(raw);
