import data from "../../../catalog-data/generated/radiator-finishes.json";
import {
  radiatorFinishCatalogSchema,
  type RadiatorFinishRole,
} from "./radiator-finish-schema";

export type {
  RadiatorFinish,
  RadiatorFinishRole,
} from "./radiator-finish-schema";
export const radiatorFinishCatalog = radiatorFinishCatalogSchema.parse(data);
export const radiatorFinishes = radiatorFinishCatalog.finishes;
export const radiatorFinishCatalogVersion = radiatorFinishCatalog.version;
export const radiatorFinishPreviewDisclaimer =
  radiatorFinishCatalog.previewDisclaimer;

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Exact aliases preserve chrome/painted product variants and thermal data. */
export function getRadiatorFinishFamily(manufacturer: string, family: string) {
  const manufacturerKey = normalized(manufacturer);
  const familyKey = normalized(family);
  return (
    radiatorFinishCatalog.families.find(
      (entry) =>
        normalized(entry.manufacturer) === manufacturerKey &&
        (normalized(entry.id) === familyKey ||
          entry.aliases.some((alias) => normalized(alias) === familyKey)),
    ) ?? null
  );
}

/** No generic RAL input: options come from the manufacturer/family/role whitelist. */
export function getRadiatorFinishOptions(
  manufacturer: string,
  family: string,
  role: RadiatorFinishRole,
) {
  const finishFamily = getRadiatorFinishFamily(manufacturer, family);
  if (!finishFamily) return [];
  return radiatorFinishes.filter((finish) =>
    finish.availability[role]?.includes(finishFamily.id),
  );
}

export function isRadiatorFinishSupported(
  manufacturer: string,
  family: string,
  role: RadiatorFinishRole,
  id: string,
) {
  return getRadiatorFinishOptions(manufacturer, family, role).some(
    (finish) => finish.id === id,
  );
}

/** Missing selection uses the documented default; unsupported explicit IDs stay unresolved. */
export function resolveRadiatorFinish(
  manufacturer: string,
  family: string,
  role: RadiatorFinishRole,
  id?: string | null,
) {
  const finishFamily = getRadiatorFinishFamily(manufacturer, family);
  if (!finishFamily) return null;
  const selectedId = id ?? finishFamily.defaultFinishIds[role];
  if (!selectedId) return null;
  return (
    getRadiatorFinishOptions(manufacturer, family, role).find(
      (finish) => finish.id === selectedId,
    ) ?? null
  );
}
